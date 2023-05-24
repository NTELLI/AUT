import * as vscode from 'vscode';
import { Configuration, OpenAIApi } from 'openai';
import * as path from 'path';
import * as fs from 'fs';

let openai: OpenAIApi;

export function activate(context: vscode.ExtensionContext) {
	const vsconfig = vscode.workspace.getConfiguration();
	let openAI_apiKey = vsconfig.get('openai.apiKey') as string;
	let openAI_organizationID = vsconfig.get('openai.organizationID') as string;
	if (!openAI_apiKey || !openAI_organizationID) {
		vscode.window.showErrorMessage('Please check your settings, apiKey and organizationID are required.');
		return;
	}

	const configuration = new Configuration({
		organization: openAI_organizationID,
		apiKey: openAI_apiKey,
	});

	openai = new OpenAIApi(configuration);

	let disposable = vscode.commands.registerCommand('ntelli-aut.generateUnitTest', async () => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				const folderPath = path.dirname(editor.document.fileName);
				const fileName = path.basename(editor.document.fileName);
				const prompt = editor.document.getText();
				const cancellationTokenSource = new vscode.CancellationTokenSource();
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: 'Generating unit test...',
						cancellable: true,
					},
					async (progress, token) => {
						token.onCancellationRequested(() => {
							console.log('User canceled the long running operation');
							cancellationTokenSource?.cancel();
						});
						await generateTestFile(folderPath, fileName, prompt);
						progress.report({ increment: 100 });
					}
				);
			}
		} catch (error: any) {
			if (error.response?.status === 401) {
				vscode.window.showErrorMessage('The API key and organization ID are not correct or invalid.');
			} else {
				vscode.window.showErrorMessage(error.message);
			}
		}
	});

	context.subscriptions.push(disposable);
}

async function generateTestFile(folderPath: string, fileName: string, prompt: string) {
	try {
		const response = await openai.createChatCompletion({
			model: 'gpt-3.5-turbo',
			messages: [
				{
					role: 'system',
					content:
						'You are an expert in jest unit tests. Generate a jest unit test based on the input with 100% test coverage',
				},
				{ role: 'user', content: prompt },
			],
			temperature: 0,
			n: 1,
		});
		let generatedTest = response.data?.choices?.[0]?.message?.content;
		if (typeof generatedTest === 'string') {
			// Remove ``` from the code block
			generatedTest = generatedTest.replace(/`/g, '');

			const testFileName = `${fileName.split('.').slice(0, -1).join('.')}.test.ts`;
			const testFilePath = path.join(folderPath, testFileName);
			fs.writeFileSync(testFilePath, generatedTest.toString());

			vscode.window.showInformationMessage(`Unit test generated and saved at ${testFilePath}`);
		} else {
			vscode.window.showErrorMessage('Failed to generate the unit test. Please check your OpenAI response.');
		}
	} catch (error: any) {
		if (error.response?.status === 401) {
			vscode.window.showErrorMessage('The API key and organization ID are not correct or invalid.');
		} else {
			vscode.window.showErrorMessage(error.message);
		}
	}
}
