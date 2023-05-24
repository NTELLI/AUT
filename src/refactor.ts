import * as vscode from 'vscode';
import { Configuration, OpenAIApi } from 'openai';
import * as path from 'path';

async function getRefactorSuggestion(): Promise<void> {
	const vsconfig = vscode.workspace.getConfiguration();
	let OPENAI_APIKEY = vsconfig.get('openai.api_key') as string;
	let OPENAI_ORGANIZATIONID = vsconfig.get('openai.organization_ID') as string;
	if (!OPENAI_APIKEY || !OPENAI_ORGANIZATIONID) {
		vscode.window.showErrorMessage('Please check your settings, apiKey and organizationID are required.');
		return;
	}

	// Set up the configuration object
	const configuration = new Configuration({
		organization: OPENAI_ORGANIZATIONID,
		apiKey: OPENAI_APIKEY,
	});

	// Create the OpenAIApi object
	const openai = new OpenAIApi(configuration);

	// Get the current text editor
	let editor = vscode.window.activeTextEditor;
	if (editor) {
		// Get the position of the last line of the highlighted text
		let selection = editor.selection;

		//get filepath from the currently open file
		const filePath = editor?.document.uri.fsPath;
		let fileExtension;
		if (filePath) fileExtension = path.extname(filePath);

		// Modify the prompt to include the cursor position
		const input = editor.document.getText(
			new vscode.Range(selection.start.line + 0, 0, selection.end.line, selection.end.character)
		);
		// Get the code edit suggestions

		try {
			const response = await openai.createChatCompletion({
				model: 'gpt-3.5-turbo',
				messages: [
					{
						role: 'system',
						content: 'You are an expert in refactoring jest unit tests.',
					},
					{ role: 'user', content: input },
				],
				temperature: 0,
				n: 1,
			});

			// Replace the highlighted text with the suggestions
			// vscode.window.showInformationMessage(response.data?.choices?.[0]?.message?.content as string);
			vscode.window.showInformationMessage(response.data?.choices?.[0]?.message?.content as string, { modal: true });
		} catch (error: any) {
			if (error.response.status === 401) {
				vscode.window.showErrorMessage('The API key and organization ID are not correct or invalid.');
			} else {
				vscode.window.showErrorMessage(error.message);
			}
		}
	} else {
		vscode.window.showErrorMessage('No text editor is active. Please open a file first.');
	}
}

export const refactorTest = vscode.commands.registerCommand('ntelli-aut.generateUnitTestEdit', async () => {
	try {
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Loading...',
				cancellable: false,
			},
			async (progress, token) => {
				token.onCancellationRequested(() => {
					console.log('User canceled the long running operation');
				});
				await getRefactorSuggestion();
				progress.report({ increment: 100 });
			}
		);
	} catch (err: any) {
		if (err.code === 'ENOENT') {
			vscode.window.showErrorMessage('settings.json file not found.');
		} else if (err instanceof SyntaxError) {
			vscode.window.showErrorMessage('settings.json file is not a valid JSON file.');
		} else {
			vscode.window.showErrorMessage('An error occurred while reading settings.json file.');
		}
	}
});
