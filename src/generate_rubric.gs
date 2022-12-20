const RubricGenerator = (function () {
	//> Misc Utils
	function noOpFormat(strings, ...placeholders) {
		let builder = "";
		for (let i = 0; i < strings.length; i++) {
			builder += strings[i];
			if (i < placeholders.length) {
				builder += placeholders[i];
			}
		}

		return builder;
	}

	function withoutLeading(strings, ...placeholders) {
		const raw = noOpFormat(strings, ...placeholders);
		return raw.replace(/^[ \t]+/gm, "");
	}

	//> CSV Helpers
	function parseCSV(file) {
		// Normalize CRLF to LF
		file = file.replace(/\r\n/g, "\n");

		// Parse CSV file
		const rows = [];
		let head = 0;

		while (file[head] !== undefined) {
			const row = [];

			// Parse CSV line
			while (true) {
				// Check whether we're terminating the line
				if (file[head] === undefined) {
					break;
				}

				if (file[head] === "\n") {
					head += 1;
					break;
				}

				// Expect "," if this is not the first cell on the line
				if (row.length > 0) {
					if (file[head] !== ",") {
						throw "Encountered undelimited string literal.";
					}

					head += 1;
				}

				// Parse quoted CSV cell
				if (file[head] === "\"") {
					head += 1;

					let builder = "";

					while (true) {
						// Error on EOF
						if (file[head] === undefined) {
							throw "Encountered unterminated string literal.";
						}

						// Search for quote
						if (file[head] === "\"") {
							head += 1;

							if (file[head] === "\"") {
								// Treat as an escape if two quotes are specified back to back.
								// (fallthrough)
							} else {
								// Otherwise, treat it as a terminator.
								break;
							}
						}

						// Parse regular character
						builder += file[head++];
					}

					row.push(builder);
					continue;
				}

				// Parse naked CSV cell
				let builder = "";

				while (true) {
					// Stop on delimiter
					if (file[head] === undefined || file[head] === "\n" || file[head] === ",") {
						break;
					}

					builder += file[head++];
				}

				row.push(builder);
			}

			// Ignore lines without explicit cells
			if (row.length === 0) {
				continue;
			}

			// Ensure that all rows have the same length
			if (rows.length > 0 && rows[0].length !== row.length) {
				throw "Rows must have the same length.";
			}

			// Commit the row
			rows.push(row);
		}

		return rows;
	}

	class CsvBuilder {
		constructor() {
			this.builder = "";
		}

		pushRow() {
			this.builder += "\n";
		}

		pushCell(value) {
			this.builder += `"${value.replace(/"/g, '""')}",`;
		}
	}

	//> Table Building Helpers
	function codeToChar(i) {
		return String.fromCharCode(i);
	}

	function charToCode(c) {
		return c.charCodeAt(0);
	}

	function roundNum(num, digits) {
		const mul = 10 ** digits;
		return Math.round(num * mul) / mul;
	}

	function colFormulaName(row) {
		const A = charToCode("A");
		let builder = "";

		row += 1;

		while (row > 0) {
			let cc = A + (row % 26);

			if (row < 25) {
				cc -= 1;
			}

			builder = codeToChar(cc) + builder;
			row = Math.floor(row / 26);
		}

		return builder;
	}

	class CellRef {
		constructor(row, col, sheet = null) {
			this.row_ = row;
			this.col_ = col;
			this.sheet = sheet;
		}

		//> Property re-exports
		get row() {
			return this.row_;
		}

		get col() {
			return this.col_;
		}

		//> Relational operators
		at(row, col) {
			return new CellRef(row, col, this.sheet);
		}

		offset(row_delta, col_delta) {
			return new CellRef(
				this.row === null ? null : this.row + row_delta,
				this.col === null ? null : this.col + col_delta,
				this.sheet,
			);
		}

		above() {
			return this.offset(-1, 0);
		}

		below() {
			return this.offset(1, 0);
		}

		left() {
			return this.offset(0, -1);
		}

		right() {
			return this.offset(0, 1);
		}

		asRange(rows, cols) {
			return cols === undefined ?
				new RangeRef(this) :
				new RangeRef(this).extend(rows, cols);
		}

		//> GScript integration
		gsGetRange(sheet) {
			return sheet.getRange(this.row + 1, this.col + 1);
		}

		//> Representational Conversions
		get map_key() {
			return `${this.row},${this.col}`;
		}

		get sheet_prefix() {
			return this.sheet !== null ? `${this.sheet}!` : "";
		}

		get col_name() {
			return `$${colFormulaName(this.col)}`;
		}

		get row_name() {
			return `$${this.row + 1}`;
		}

		get local_formula() {
			return `${this.col_name}${this.row_name}`;
		}

		get formula() {
			return `${this.sheet_prefix}${this.local_formula}`;
		}

		get unbounded_col() {
			return `${this.sheet_prefix}${this.col_name}:${this.col_name}`;
		}

		get unbounded_row() {
			return `${this.sheet_prefix}${this.row_name}:${this.row_name}`;
		}

		toString() {
			return this.formula;
		}
	}

	class RangeRef {
		constructor(start, end) {
			if (end === undefined) {
				this.start_ = start;
				this.end_ = start;
			} else {
				const sheet = start.sheet;
				if (start.sheet !== end.sheet) {
					throw "Mismatched sheets";
				}

				this.start_ = new CellRef(
					Math.min(start.row, end.row),
					Math.min(start.col, end.col),
					sheet,
				);
				this.end_ = new CellRef(
					Math.max(start.row, end.row),
					Math.max(start.col, end.col),
					sheet,
				);
			}
		}

		extend(rows, cols) {
			return new RangeRef(this.start_, this.end_.offset(rows, cols));
		}

		gsGetRange(sheet) {
			return sheet.getRange(
				this.start_.row + 1,
				this.start_.col + 1,
				this.width,
				this.height,
			);
		}

		get start() {
			return this.start_;
		}

		get end() {
			return this.end_;
		}

		get width() {
			return this.end_.row - this.start_.row + 1;
		}

		get height() {
			return this.end_.col - this.start_.col + 1;
		}

		get formula() {
			return `${this.sheet_prefix}${this.start_.local_formula}:${this.end_.local_formula}`;
		}

		get sheet() {
			return this.start_.sheet;
		}

		get sheet_prefix() {
			return this.start_.sheet_prefix;
		}
	}

	class TableBuilder {
		constructor() {
			this.aabb = new CellRef(0, 0);
			this.cells = new Map();
			this.format_merges = [];
			this.format_ops = [];
		}

		get(pos) {
			return this.cells.get(pos.map_key);
		}

		set(pos, content, style) {
			// Grow AABB
			this.aabb = this.aabb.at(
				Math.max(this.aabb.row, pos.row),
				Math.max(this.aabb.col, pos.col),
			);

			// Set cell
			const key = pos.map_key;
			if (this.cells.has(key)) {
				throw `Cell at ${pos} already has a value.`;
			}
			this.cells.set(key, content);

			// Set style
			if (style !== undefined) {
				this.format(pos, style);
			}
		}

		format(range, style) {
			if (range instanceof CellRef) {
				range = range.asRange();
			}

			this.format_ops.push({ kind: "style", range, style });
		}

		formatBorder(range) {
			this.format(range, { border: { top: true, left: true, bottom: true, right: true } });
		}

		formatMerge(range) {
			this.format_merges.push(range);
		}

		formatBorderAndMerge(range) {
			this.formatBorder(range);
			this.formatMerge(range);
		}

		formatColumnSize(index, size) {
			this.format_ops.push({ kind: "column_resize", index, size });
		}

		formatRowSize(index, size) {
			this.format_ops.push({ kind: "row_resize", index, size });
		}

		asCSV() {
			const builder = new CsvBuilder();

			for (let row = 0; row <= this.aabb.row; row++) {
				for (let col = 0; col <= this.aabb.col; col++) {
					const cell = this.get(new CellRef(row, col));
					builder.pushCell(cell !== undefined ? cell : "");
				}
				builder.pushRow();
			}

			return builder.builder;
		}

		gsWriteToSheet(sheet) {
			// Write raw text
			const values = [];

			for (let row = 0; row <= this.aabb.row; row++) {
				const row_value = [];
				for (let col = 0; col <= this.aabb.col; col++) {
					const cell_value = this.get(new CellRef(row, col));
					row_value.push(cell_value !== undefined ? cell_value : "");
				}

				values.push(row_value);
			}

			sheet.getRange(1, 1, this.aabb.row + 1, this.aabb.col + 1)
				.setValues(values);

			// Apply merges
			for (const range of this.format_merges) {
				range.gsGetRange(sheet).merge();
			}

			// Apply formatting
			for (const op of this.format_ops) {
				if (op.kind === "style") {
					const range = op.range.gsGetRange(sheet);
					const style = op.style;

					// Apply cell formatting
					if ("background_color" in style) {
						range.setBackground(style.background_color);
					}

					if ("align" in style) {
						range.setHorizontalAlignment(style.align);
					}

					if ("valign" in style) {
						range.setVerticalAlignment(style.valign);
					}

					if ("number_format" in style) {
						range.setNumberFormat(style.number_format);
					}

					if ("border" in style) {
						const { top, left, bottom, right, vertical, horizontal } = style["border"];
						range.setBorder(
							top ?? null,
							left ?? null,
							bottom ?? null,
							right ?? null,
							vertical ?? null,
							horizontal ?? null,
						);
					}

					if ("wrap_strategy" in style) {
						range.setWrap(true);
						range.setWrapStrategy(SpreadsheetApp.WrapStrategy[style.wrap_strategy]);
					}

					// Apply text formatting
					const builder = SpreadsheetApp.newTextStyle();

					if ("font_family" in style) {
						builder.setFontFamily(style.font_family);
					}

					if ("font_size" in style) {
						builder.setFontSize(style.font_size);
					}

					if ("color" in style) {
						builder.setForegroundColor(style.color);
					}

					if ("bold" in style) {
						builder.setBold(style.bold);
					}

					if ("italic" in style) {
						builder.setItalic(style.italic);
					}

					if ("underline" in style) {
						builder.setUnderline(style.underline);
					}

					range.setTextStyle(builder.build());
				} else if (op.kind === "column_resize") {
					sheet.setColumnWidth(op.index + 1, op.size);
				} else if (op.kind === "row_resize") {
					sheet.setRowHeight(op.index + 1, op.size);
				} else {
					throw `Unrecognized formatting operation: ${op.kind}`;
				}
			}
		}
	}

	//> Rubric Header Parser
	class Rubric {
		constructor(sheet_name, headings) {
			this.sheet_name = sheet_name;

			// Validate headings and extract objectives paths
			const objective_paths = [];
			{
				let head = 0;

				// Validate required fields
				if (headings[head++] !== "Student name" || headings[head++] !== "Student ID") {
					throw "Missing student name or student ID column.";
				}

				// Validate and extract content objectives
				while (head < headings.length) {
					//> Parse path

					// Extract result header
					let result_header = headings[head++];

					// Extract mastery header
					if (head >= headings.length) {
						throw "Missing corresponding mastery header.";
					}
					let mastery_header = headings[head++];

					// Extract path from result header.
					// Format: `<SOF>(path > to > blah) result<EOF>`
					result_header = result_header.match(/^([^]*) result$/);
					if (result_header === null) {
						throw "Missing result column.";
					}
					const [_, objective_path_str] = result_header;

					// Ensure that the mastery header is of the form:
					// `<SOF><objective_path_str> mastery points<EOF>`
					if (
						!mastery_header.startsWith(objective_path_str) ||
						mastery_header.substring(objective_path_str.length) !== " mastery points"
					) {
						throw "Missing corresponding mastery points column for result column.";
					}

					// Push path to list
					const parts = objective_path_str
						// Extract standard path parts, stripping any Canvas-added formatting.
						.split(" > ")
						// Remove prefixes like "1. "
						.map(part => part.replace(/^\d+\. /, ""));

					objective_paths.push(parts);
				}
			}

			// Extract objective tree
			this.root_objective = new Objective("default root");

			for (let objective_index = 0; objective_index < objective_paths.length; objective_index++) {
				const objective_path = objective_paths[objective_index];
				let target = this.root_objective;

				for (const part of objective_path) {
					target = target.getOrCreateChild(part);
				}

				target.assignColumn(objective_index, sheet_name);
			}

			// Collapse the first parent if it only has a single child.
			if (this.root_objective.children.length === 1) {
				this.root_objective = this.root_objective.children[0];
			}

			// Extract header names
			this.name_column = new CellRef(null, 0, sheet_name);
			this.id_column = new CellRef(null, 1, sheet_name);
		}
	}

	class Objective {
		constructor(name) {
			this.name = name;
			this.children = [];
			this.name_to_index = new Map();
			this.value_column = null;
			this.points_column = null;
		}

		assignColumn(col, sheet_name) {
			if (this.value_column !== null) {
				throw "Assigned column to specified `Objective` more than once.";
			}
			this.value_column = new CellRef(null, 2 + 2 * col, sheet_name);
			this.points_column = new CellRef(null, 3 + 2 * col, sheet_name);
		}

		getOrCreateChild(name) {
			let child_index = this.name_to_index.get(name);

			if (child_index === undefined) {
				child_index = this.children.length;

				this.children.push(new Objective(name));
				this.name_to_index.set(name, child_index);
			}

			return this.children[child_index];
		}

		getChild(name) {
			const child_index = this.name_to_index.get(name);
			return child_index !== undefined ?
				this.children[child_index] :
				null;
		}

		getChildByPath(parts) {
			let target = this;

			for (const part of parts) {
				target = target.getChild(part);
				if (target === null) {
					throw `unknown child with name "${part}"`;
				}
			}

			return target;
		}
	}

	//> Builder
	const DEFAULT_MASTERY_EXPLANATIONS = withoutLeading`\
	Learning standard mastery levels:
	4* - (Commendation) Student work shows evidence of especially sophisticated, nuanced, or analytical thinking. 
	4 - (Mastery) Student demonstrates mastery of the standards assessed. 
	3 - (Partial mastery) Student demonstrates partial mastery of the standards assessed.
	2 - (Emerging understanding) Student demonstrates an emerging understanding of the standards assessed.
	1 - (Insufficient evidence) Student has submitted insufficient evidence for the standards assessed.\
	`;

	const DEFAULT_GRADE_TABLE_VALUES = [
		[0, "A"],
		[0, "A-"],
		[0, "B+"],
		[0, "B"],
		[0, "B-"],
		[0, "C+"],
		[0, "C"],
		[0, "C-"],
		[0, "D+"],
		[0, "D"],
	];

	function buildSummary(rubric) {
		const table = new TableBuilder();

		// Define styles
		const STYLE_BOLD = {
			bold: true,
		};

		const STYLE_DOCUMENT_HEADER = {
			...STYLE_BOLD,
			background_color: "#cccccc",
		};

		const STYLE_SUMMARY_BASE = {
			background_color: "#f4cccc",
		};

		const STYLE_SUMMARY_NAME = {
			...STYLE_SUMMARY_BASE,
			align: "right",
			bold: true,
		};

		const STYLE_SUMMARY_VALUE = {
			...STYLE_SUMMARY_BASE,
			number_format: "0.00",
			align: "center",
		};

		const STYLE_SECTION_HEADER = {
			...STYLE_BOLD,
			background_color: "#b7b7b7",
			align: "center",
		};

		// Define lookup mechanism
		const sid_cell = new CellRef(0, 0);

		function makeLookupFormula(target_column) {
			return `=LOOKUP(${sid_cell.formula}, ${rubric.id_column.unbounded_col}, ${target_column.unbounded_col})`;
		}

		// Write column sizes
		{
			const SIZES = [100, 26, 240, 118, 180, 100, 100, 170, 100];
			for (let i = 0; i < SIZES.length; i++) {
				table.formatColumnSize(i, SIZES[i]);
			}
		}

		// Write header
		let head = sid_cell.offset(0, 1);
		let grade_display_cell;

		{
			// Write student ID
			table.set(sid_cell, "1");
			table.set(sid_cell.below(), "Student ID ^^", { align: "right" });

			// Apply gray header style to first two rows
			table.format(new RangeRef(head, head.offset(1, 4)), STYLE_DOCUMENT_HEADER);

			// Write student name
			table.set(head.offset(0, 0), makeLookupFormula(rubric.name_column));
			table.formatMerge(head.asRange(0, 2));

			// Write course grade
			table.set(head.offset(0, 3), "Course grade:");
			grade_display_cell = head.offset(0, 4);

			// Apply a border to the first line
			table.formatBorder(head.asRange(0, 4));
			head = head.below();

			// Write course title
			table.set(head, "Enter Course Name Here");
			table.formatBorderAndMerge(head.asRange(0, 4));

			head = head.below();
		}

		// Write default mastery explanations
		{
			table.set(head, DEFAULT_MASTERY_EXPLANATIONS);
			table.formatBorderAndMerge(head.asRange(0, 4));
			head = head.below();
		}

		// Write mastery level summaries
		const categories = rubric.root_objective.children;
		const category_avg_cells = [];
		{
			let average_formula_builder = "=";
			const start = head;

			// Write out category averages
			for (let i = 0; i < categories.length; i++) {
				const category = categories[i];

				// Determine cell locations
				const summary_cell = head;
				const average_cell = head.offset(0, 2);
				head = head.below();

				// Keep track of the average cell to fill in later
				category_avg_cells.push(average_cell);

				// Write average header
				table.set(summary_cell, `${category.name} Avg (${roundNum(100 / categories.length, 2)}% weight)`);

				// Build global average formula
				if (i > 0) {
					average_formula_builder += "+";
				}
				average_formula_builder += `REGEXEXTRACT(${summary_cell.formula},".*\\(([\\d.]+)% weight\\)")/100*${average_cell.formula}`;

				// Format these three cells appropriately
				table.format(summary_cell.asRange(0, 1), STYLE_SUMMARY_NAME);
				table.formatMerge(summary_cell.asRange(0, 1));
				table.format(average_cell, STYLE_SUMMARY_VALUE);
			}

			// Format the left border
			table.formatBorder(new RangeRef(start, head.offset(-1, 2)));

			// Write out total mastery level average
			const average_mastery_level_cell = head.offset(0, 2);
			table.set(head, "Average Mastery Level");
			table.set(average_mastery_level_cell, average_formula_builder);

			// Format the grade mastery conversion
			{
				// Construct the lookup table
				const lookup_start = start.offset(0, 6);
				const lookup_full_range = lookup_start.asRange(DEFAULT_GRADE_TABLE_VALUES.length, 1);

				table.format(lookup_start.asRange(0, 1), { bold: true, align: "left" });
				table.set(lookup_start, "Minimum Mastery Level");
				table.set(lookup_start.right(), "Letter Grade");

				for (let i = 0; i < DEFAULT_GRADE_TABLE_VALUES.length; i++) {
					const [score, grade] = DEFAULT_GRADE_TABLE_VALUES[i];

					table.set(lookup_start.offset(i + 1, 0), score, { number_format: "0.00", align: "left" });
					table.set(lookup_start.offset(i + 1, 1), grade, { align: "left" });
				}

				// Construct the summary
				const summary_range = new RangeRef(start.offset(0, 3), head.offset(0, 4));
				table.format(summary_range, STYLE_SUMMARY_BASE);
				table.formatBorderAndMerge(summary_range);
				table.set(start.offset(0, 3), `=RUBRICIZER_GRADE_SUMMARY(${lookup_full_range.formula})`, { wrap_strategy: "WRAP" });

				// Construct the grade display
				table.set(grade_display_cell, `=RUBRICIZER_GRADE_SEARCH(${lookup_full_range.formula}, ${average_mastery_level_cell.formula})`);
			}

			// Format these three cells appropriately
			table.format(head.asRange(0, 1), STYLE_SUMMARY_NAME);
			table.formatMerge(head.asRange(0, 1));
			table.format(head.offset(0, 2), STYLE_SUMMARY_VALUE);
			table.formatBorder(head.asRange(0, 2));

			head = head.below();
		}

		// Write out score tree
		function writeTree(node) {
			if (node.value_column !== null) {
				// Treat node as leaf
				table.set(head, makeLookupFormula(node.value_column));
				table.set(head.offset(0, 1), node.name);
				table.formatBorder(head);
				table.format(head, { valign: "middle", align: "center" });
				table.formatMerge(new RangeRef(head.offset(0, 1), head.offset(0, 4)));
				table.format(head.offset(0, 5), { border: { left: true } });

				head = head.below();
			} else {
				// Treat node as header
				table.set(head, node.name);
				table.formatBorderAndMerge(new RangeRef(head, head.offset(0, 4)));
				table.format(new RangeRef(head, head.offset(0, 4)), STYLE_SECTION_HEADER);

				head = head.below();

				// Write childen
				for (const child of node.children) {
					writeTree(child);
				}
			}
		}

		for (let i = 0; i < categories.length; i++) {
			const start = head;
			writeTree(categories[i]);
			const end = head.above();

			table.set(category_avg_cells[i], `=AVERAGE(${start.formula}:${end.formula})`);
		}

		table.format(head.above().asRange(0, 4), { border: { bottom: true } });

		return table;
	}

	return { parseCSV, Rubric, buildSummary };
}());

//> Local Testing Logic
if (false) {
	const fs = require("fs");
	const csv = RubricGenerator.parseCSV(fs.readFileSync("input.csv", "UTF-8"));
	const rubric = new RubricGenerator.Rubric("Grades", csv[0]);
	const table = RubricGenerator.buildSummary(rubric);
	fs.writeFileSync("output.csv", table.asCSV());
}

//> GScript logic
function gsHookGenerateRubric() {
	// Obtain the active sheet and validate it.
	const doc = SpreadsheetApp.getActive();
	const input_sheet = SpreadsheetApp.getActiveSheet();

	if (doc === null || input_sheet === null) {
		throw "No active spreadsheet.";
	}

	// Import Canvas Rubric
	input_sheet.setName("Gradebook");
	const input_sheet_data = input_sheet.getDataRange();
	const input_sheet_data_raw = input_sheet_data.getValues();
	const rubric = new RubricGenerator.Rubric(
		input_sheet.getName(),
		input_sheet_data_raw[0].map(col => col.toString()),
	);

	// Generate output
	const table = RubricGenerator.buildSummary(rubric);
	const output_sheet = doc.insertSheet();
	output_sheet.setName("Summary Rubric");
	table.gsWriteToSheet(output_sheet);
}
