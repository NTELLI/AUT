import { TransformCallback } from 'stream';
import * as vscode from 'vscode';
import axios from 'axios';

async function getRefactorSuggestion(): Promise<void> {
	const streamNode = require('stream');
	const vsconfig = vscode.workspace.getConfiguration();
	let OPENAI_APIKEY = vsconfig.get('openai.api_key') as string;
	let OPENAI_ORGANIZATIONID = vsconfig.get('openai.organization_ID') as string;
	if (!OPENAI_APIKEY || !OPENAI_ORGANIZATIONID) {
		vscode.window.showErrorMessage('Please check your settings, apiKey and organizationID are required.');
		return;
	}

	// Get the current text editor
	let editor = vscode.window.activeTextEditor;
	if (editor) {
		// Get the position of the last line of the highlighted text
		let selection = editor.selection;

		// Modify the prompt to include the cursor position
		const input = editor.document.getText(
			new vscode.Range(selection.start.line + 0, 0, selection.end.line, selection.end.character)
		);

		const transformStream = new streamNode.Transform({
			transform(chunk: Buffer | string, encoding: string | null, callback: TransformCallback) {
				let transformedData = chunk.toString('utf-8');
				transformedData = transformedData.replace(/\\n/g, '\n');
				transformedData = transformedData.replace(/`/g, '');
				transformedData = transformedData.replace(/\\t/g, '');

				const regex = /"content":"([^"]*)"/;
				const match = regex.exec(transformedData);

				let content = match ? match[1] : '';

				this.push(content);
				callback();
			},
		});

		try {
			const url = 'https://api.openai.com/v1/chat/completions';
			const headers = {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${OPENAI_APIKEY ?? ''}`,
			};
			const payload = {
				model: 'gpt-3.5-turbo',
				messages: [
					{
						role: 'system',
						content:
							'You are an expert in refactoring Jest unit tests. Come with your best opnion on how to refactor the provided input, with comments and code.',
					},
					{ role: 'user', content: input },
				],
				stream: true,
			};
			axios
				.post(url, payload, {
					headers: headers,
					responseType: 'stream',
				})
				.then(response => {
					const view = vscode.window.createWebviewPanel(
						'ntelli-aut.refactorTest.results',
						'Refactor Test Results',
						vscode.ViewColumn.One,
						{
							enableScripts: true,
						}
					);

					let text = '';
					response.data.pipe(transformStream).on('data', (chunk: any) => {
						text += chunk;
						if (view) {
							view.webview.html = `
							<!DOCTYPE html>
							<html>
								<head>
									<style>
										body {
											color: #f2f2f2;
											font-size: 16px;
											line-height: 1.5;
											padding: 20px;
										}
										p {
											margin-bottom: 20px;
										}
									</style>
								</head>
							
								<body>
									<p>${text}</p>
								</body>
							</html>
							`;
						}
					});

					response.data.on('end', () => {
						vscode.window.showInformationMessage(`Refactor suggestion has been provided`);
					});
				})
				.catch(error => {
					console.error(error);
				});
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

export const refactorTest = vscode.commands.registerCommand('ntelli-aut.refactorTest', async () => {
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
