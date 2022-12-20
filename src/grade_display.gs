const GradeDisplay = (function () {
	function parseTable(rows) {
		// Check types
		if (!(rows instanceof Array)) {
			throw "Expected a single argument specifying the grade range!";
		}

		if (rows.length > 0 && rows[0].length !== 2) {
			throw "Expected a range with two columns";
		}

		// Filter out empty rows
		rows = rows.filter(([a]) => a !== "");

		if (rows.length > 0 && rows[0][0] === "Minimum Mastery Level" && rows[0][1] === "Letter Grade") {
			rows.splice(0, 1);
		}

		// Ensure that the left column contains exclusively numbers
		rows.forEach(([score, grade]) => {
			if (typeof score === "number") {
				return [score, grade];
			} else {
				throw "Expected exclusively numbers in the left column!";
			}
		});

		// Sort the range
		rows.sort(([a_score, _1], [b_score, _2]) => b_score - a_score);

		return rows;
	}

	return { parseTable };
}());

function RUBRICIZER_GRADE_SUMMARY(rows) {
	rows = GradeDisplay.parseTable(rows);

	// Build descriptor
	const round = (v) => (Math.round(v * 100) / 100).toFixed(2);

	let prev_upper_bound = 4;
	const descriptors = rows.map(([min_score, name]) => {
		const tmp = `${name}: ${round(min_score, 2)}-${round(prev_upper_bound, 2)}`;
		prev_upper_bound = min_score;
		return tmp;
	});

	return `Mastery level to grade conversion scale:\n${descriptors.join("; ")}`;
}

function RUBRICIZER_GRADE_SEARCH(rows, mastery_level) {
	if (typeof mastery_level !== "number") {
		throw "Second argument (mastery level) must be a number!";
	}

	rows = GradeDisplay.parseTable(rows);

	for (let i = 0; i < rows.length; i++) {
		const [min_score, grade] = rows[i];

		if (mastery_level >= min_score) {
			return grade;
		}
	}

	return "—";
}
