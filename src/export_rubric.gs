function gsHookGeneratePDFs() {
	const SUMMARY_RUBRIC_NAME = "Summary Rubric";
	const PROMPT_EXIT_EXCEPTION = "Please answer all prompts.";

	//> Acquire all the resources used by this routine.
	const gsheet = SpreadsheetApp.getActiveSpreadsheet();
	const rubric = gsheet.getSheetByName(SUMMARY_RUBRIC_NAME);
	const ui = SpreadsheetApp.getUi();

	if (rubric === null) {
		throw `The sheet containing the rubric you wish to turn into a PDF must be called "${SUMMARY_RUBRIC_NAME}".`;
	}

	//> Begin by obtaining the number of students in the class.
	// This is done first because users might not know how many students are in their course and easily
	// click out of this dialog, cancelling the routine.
	let NUM_STUDENTS;
	{
		// Detect whether the teacher is using a canvas-generated gradebook.
		//
		// There are two types of users for Rubricizer: the English team—who uses Rubricizer to generate
		// rubrics from start to finish—and teachers like Rob—who are capable of writing their own rubric
		// displays and just need a tool to generate all `NUM_STUDENTS` PDFs. This tool needs to handle
		// both types of users. Specifically, it needs to be able to auto-detect the number of students
		// for a canvas-generated gradebook but it should also expose a manual prompt if the teacher
		// customized their rubric in such a way that the assumption made here about student counts no
		// longer apply.
		let is_canvas;
		const gradebook = gsheet.getSheetByName("Gradebook");
		const gradebook_values = gradebook !== null ?
			gradebook.getDataRange().getValues() :
			null;

		if (gradebook !== null) {
			try {
				// Because PDF generation is slow, we need to be really confident that we're working with a
				// canvas-generated gradebook. We do this by reusing code from `RubricGenerator`, which implements
				// exceedingly conservative parsing.
				const _ignored = new RubricGenerator.Rubric(gradebook.getName(), gradebook_values[0]);
				// TODO: To make this truly robust, we need to validate the actual student ID range
				// to make sure it actually corresponds to our assumption that student IDs are
				// assigned continuously.
				is_canvas = true;
			} catch (e) {
				// TODO: We could actually test that the raised exception is of the appropriate type.
				//  Unfortunately, doing so would require us to... raise an exception of the appropriate
				//  type.

				Logger.info(`Failed to parse gradebook headers as Canvas headers: ${e}. This likely means that we're working with a teacher-generated rubric.`);
				is_canvas = false;
			}
		} else {
			is_canvas = false;
		}

		// Then, determine the number of students in the class.
		if (is_canvas) {
			// In this case, we are simply using the number of rows in the sheet minus the header row.
			NUM_STUDENTS = gradebook_values.length - 1;
		} else {
			// Otherwise, we ask the user to enter in the number of students explicitly.
			let resp = ui.prompt(
				"Student Count",
				"How many students are in this class? (this corresponds to the maximum student ID plus one)",
				ui.ButtonSet.OK_CANCEL,
			);
			if (resp.getSelectedButton() !== ui.Button.OK) {
				throw PROMPT_EXIT_EXCEPTION;
			}
			resp = resp.getResponseText();
			resp = parseInt(resp);
			if (isNaN(resp)) {
				throw "Please enter a number for the number of students in this class.";
			}

			NUM_STUDENTS = resp;
		}
	}

	//========================================================================
	var ran_obtainInfo = false; //for run-once-only capabilities

	var info = pdf_obtain_info(); //new var so it doesn't run the function thrice
	var ssID = info[0]
	var OUTPUT_FOLDER_NAME = info[1]
	var OUTPUT_PDF_NAME = info[2];

	Logger.log("ssID: " + String(ssID) + "\nOutput Folder Name: " + OUTPUT_FOLDER_NAME + "\nPDF Name: " + OUTPUT_PDF_NAME);
	Logger.log("num of students: " + NUM_STUDENTS);

	//vv function defining vv
	function pdf_obtain_info() {
		if (ran_obtainInfo === true) {
			Logger.log("already ran pdf_obtain_info! returning...")
			return;
		}

		let OUTPUT_FOLDER_NAME = "rubric_download", OUTPUT_PDF_NAME = "STUDENTNAME_Rubric"; //defaults

		// vv Dialogue Box for Name of output folder vv ========
		var outputFolderPrompt = ui.prompt('Name of Output Folder', 'Please enter the name of the folder you\'d like to save the PDFs to. Please ensure the folder is in the same Drive location as this GSheet. If there is no folder, one will be made automatically.', ui.ButtonSet.OK_CANCEL);
		if (outputFolderPrompt.getSelectedButton() == ui.Button.OK) {
			//Logger.log('User Input for Output Folder Name: ' + String(outputFolderPrompt.getResponseText()));
			if (outputFolderPrompt.getResponseText() != "") { OUTPUT_FOLDER_NAME = outputFolderPrompt.getResponseText(); }
		} else {
			ui.alert("Please rerun the program to re-enter the information.");
			throw "The user canceled or closed the Output Folder prompt.";
		}
		// vv Dialogue Box for names of PDFs vv ========
		var outputPDFPrompt = ui.prompt('Name of Saved PDFs', 'Please enter the name you\'d like to save the PDfs as. Add "STUDENTNAME" to have it replaced with the student\'s name, and "DOCNAME" for the name of the GSheet. Don\'t include the ".pdf."', ui.ButtonSet.OK_CANCEL);
		if (outputPDFPrompt.getSelectedButton() == ui.Button.OK) {
			//Logger.log('User Input for Output PDF Name: ' + String(outputPDFPrompt.getResponseText()));
			if (outputPDFPrompt.getResponseText() != "") { OUTPUT_PDF_NAME = outputPDFPrompt.getResponseText(); }
		} else {
			ui.alert("Please rerun the program to re-enter the information.");
			throw "The user canceled or closed the Output PDF prompt.";
		}

		// vv confirmation of names vv ========
		var info_confirmation = ui.alert('Confirm your saving locations/names:\nFolder Name: ' + OUTPUT_FOLDER_NAME + '\nFile Name: ' + OUTPUT_PDF_NAME + '\n\nPlease also ensure the GSheet\'s tabs are named "Summary Rubric" and "Gradebook".', ui.ButtonSet.YES_NO);
		if (info_confirmation == ui.Button.NO) {
			//Logger.log('User Input for Output PDF Name: ' + String(outputPDFPrompt.getResponseText()));
			ui.alert("Please rerun the program to re-enter the information.");
			throw "The user canceled or closed the Info Confirmation prompt.";
		}
		//Logger.log(SpreadsheetApp.getActiveSpreadsheet().getId());
		ran_obtainInfo = true;
		return [SpreadsheetApp.getActiveSpreadsheet().getId(), OUTPUT_FOLDER_NAME, OUTPUT_PDF_NAME];
		//returns: ssID, OUTPUT_FOLDER_NAME, OUTPUT_PDF_NAME
	}

	function pdf_getFolderByName_(folderName) {
		//original from https://developers.google.com/apps-script/samples/automations/generate-pdfs thank you
		//input: name of GDrive folder
		//returns: new GDrive folder
		//does: makes a new GDrive folder w/ input folder name, or if one already exists, then returns that one

		// Gets the Drive Folder of where the current spreadsheet is located.
		//const ssId = SpreadsheetApp.getActiveSpreadsheet().getId();
		const parentFolder = DriveApp.getFileById(ssID).getParents().next();

		// Iterates the subfolders to check if the PDF folder already exists.
		const subFolders = parentFolder.getFolders();
		while (subFolders.hasNext()) {
			let folder = subFolders.next();

			// Returns the existing folder if found.
			if (folder.getName() === folderName) {
				return folder;
			}
		}
		// Creates a new folder if one does not already exist.
		return parentFolder.createFolder(folderName)
			.setDescription(`PDFs from Rubricizer`);
	}

	function pdf_getFolderByName_confirmation(folderName) {
		//original from https://developers.google.com/apps-script/samples/automations/generate-pdfs thank you
		//input: name of folder
		//output: none
		//does: a test function. prints the folder (location) the pdfs'll be saved to

		// Gets the PDF folder in Drive.
		const folder = pdf_getFolderByName_(folderName);
		Logger.log("Saved to:")
		Logger.log(`Name: ${folder.getName()}\rID: ${folder.getId()}\rDescription: ${folder.getDescription()}`)
		// To automatically delete test folder, uncomment the following code:
		// folder.setTrashed(true);
	}

	function createPDF(ssId, rubric, pdfName, folderName) {
		//original from https://developers.google.com/apps-script/samples/automations/generate-pdfs thank you
		//input: spreadsheet ID, rubric tab, desired name for PDF, name of folder to save PDF to
		//returns: none
		//does: creates & saves a .pdf in the folder indicated

		Logger.log("starting createPDF...");

		for (var i = 1; i < rubric.getMaxRows(); i++) { //TODO: find the GApps Script function that ignores unused ranges when finding size of sheet so I don't need this for-loop anymore. this is for finding lr, the row-coord of the cell you want to be the lower-right corner of the range captured in the PDF
			if (rubric.getRange(i, 2).getValue() === "") { //TODO: only calculate lr once for everyone then pass it as an input
				var lr = i - 1;
				break;
			}
		}

		//^^ lr declared above ^^
		const fr = 0, fc = 1, lc = 6; //f = "first", l = "last", r = "row", c = "column" (inclusive)
		Logger.log("pdfizing range: (" + String(fr) + "," + String(fc) + ") to (" + String(lr) + "," + String(lc) + ")");

		var sheetID = rubric.getSheetId(); //gets sheetID of the rubric tab :)

		const url = "https://docs.google.com/spreadsheets/d/" + ssId + "/export" +
			"?format=pdf&" + //ik these might not be the default print settings when you CMD+P but i haven't the heart to fix them right now
			"size=7&" +
			"fzr=true&" +
			"portrait=false&" +
			"fitw=true&" +
			"gridlines=false&" +
			"printtitle=false&" +
			"top_margin=0.5&" +
			"bottom_margin=0.25&" +
			"left_margin=0.5&" +
			"right_margin=0.5&" +
			"sheetnames=false&" +
			"pagenum=UNDEFINED&" +
			"attachment=true&" +
			"gid=" + sheetID + '&' +
			"r1=" + fr + "&c1=" + fc + "&r2=" + lr + "&c2=" + lc;

		const params = { method: "GET", headers: { "authorization": "Bearer " + ScriptApp.getOAuthToken() } };

		for (var i = 0; i < 50; i++) { //a retry-after loop, because when running a 429 "Too Many Requests" error may be thrown. caps at 50 requests because I hope it doesn't come to that.

			try {
				var blob = UrlFetchApp.fetch(url, params).getBlob().setName(pdfName + '.pdf');
				break;
			}
			catch (error) { //TODO: have it only retry if it's an error 429
				Logger.log("Error: " + String(error));
				Logger.log("Encountered error... retrying.\nRetry Counter: " + String(i));
				Utilities.sleep(10000);//waits 10 sec before retrying. TODO: exponential backoff, OR figure out how to use the "retry-after" header.
			}
		}

		// Gets the folder in Drive where the PDFs are stored.
		const folder = pdf_getFolderByName_(folderName);

		const pdfFile = folder.createFile(blob);
		ran_createPDF = true;
		Logger.log("completed createPDF");
	}

	function pdf_izer(rubric) {
		//input: rubric tab
		//returns: none, but RESULTS IN: the saving of everyone's pdfs to a GFolder indicated by the variable "OUTPUT_FOLDER_NAME"
		//does: iterates through the a1 cell in the rubric tab to create a pdf for each student

		//run-once-only lock moved to obtain_info function.

		Logger.log("starting pdf_izer...");
		var studentName = "";
		var documentName = gsheet.getName();
		pdf_getFolderByName_confirmation(OUTPUT_FOLDER_NAME);

		Logger.log(rubric.getRange(2, 2).getValue())
		for (var i = 1; i <= NUM_STUDENTS; i++) { //I don't remember why I needed the +2 //the i is for the student ID of the first rubric you'd like to make
			rubric.getRange(1, 1).setValue(i);
			studentName = rubric.getRange(1, 2).getValue();
			Logger.log(studentName);
			createPDF(ssID, rubric, OUTPUT_PDF_NAME.replace("STUDENTNAME", studentName.replace(/ /g, "_")).replace("DOCNAME", documentName.replace(/ /g, "_")), OUTPUT_FOLDER_NAME); //replaces the placeholders and puts in the student name & doc name, with the spaces replaced with underscores

		}
		Logger.log("completed pdf_izer");
		ui.alert(String(NUM_STUDENTS) + " PDFs have been saved to the folder " + OUTPUT_FOLDER_NAME + "."); //TODO: confirm that the right PDFs (number & name) are actually in the GDrive folder(?)
		ran_pdfizer = true;
	}

	//========================================================================
	//vv function running vv

	pdf_izer(rubric);
}
