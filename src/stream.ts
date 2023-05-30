import { TransformCallback } from 'stream';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';

const stream = async (folderPath: string, fileName: string, prompt: string) => {
	const streamNode = require('stream');
	const vsconfig = vscode.workspace.getConfiguration();
	let OPENAI_APIKEY = vsconfig.get('openai.api_key') as string;
	let OPENAI_ORGANIZATIONID = vsconfig.get('openai.organization_ID') as string;
	if (!OPENAI_APIKEY || !OPENAI_ORGANIZATIONID) {
		vscode.window.showErrorMessage('Please check your settings, apiKey and organizationID are required.');
		return;
	}

	let testFileName = '';
	if (fileName.includes('ts')) testFileName = `${fileName.split('.').slice(0, -1).join('.')}.test.ts`;
	if (fileName.includes('tsx')) testFileName = `${fileName.split('.').slice(0, -1).join('.')}.test.tsx`;

	const testFilePath = path.join(folderPath, testFileName);
	fs.writeFileSync(testFilePath, '');

	function commentTextBlocks() {
		fs.readFile(testFilePath, 'utf8', (err, data) => {
			if (err) {
				console.error(err);
				return;
			}
			const commentedBlock = data.replace(
				// /(^[A-Z][\w\s,.;!?-]*[.:])|([^\n]*[.:][\s\n]*(?=[A-Z]|[0-9]|\(|\s*$))/gm,
				/^[A-Z][^.\n]*[:.]\s*/gm,

				match => {
					if (data.indexOf(match) >= data.indexOf('`') && data.indexOf(match) <= data.lastIndexOf('`')) {
						return match;
					} else {
						return `// ${match}`;
					}
				}
			);

			fs.writeFileSync(testFilePath, commentedBlock);
		});
	}

	const transformStream = new streamNode.Transform({
		transform(chunk: Buffer | string, encoding: string | null, callback: TransformCallback) {
			let transformedData = chunk.toString('utf-8');
			transformedData = transformedData.replace(/\\n/g, '\n');
			transformedData = transformedData.replace(/`/g, '');

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
						'You are an expert in Jest unit tests. Generate a Jest unit test based on the input with 100% test coverage. Do not use Enzyme, Mocha, Jasmine or any other javascript test framework in the tests.',
				},
				{ role: 'user', content: prompt },
			],
			stream: true,
		};
		axios
			.post(url, payload, {
				headers: headers,
				responseType: 'stream',
			})
			.then(response => {
				response.data.pipe(transformStream).on('data', (chunk: any) => {
					fs.appendFileSync(testFilePath, chunk);
				});

				response.data.on('end', () => {
					commentTextBlocks();
					vscode.window.showInformationMessage(`Unit test generated and saved at ${testFilePath}`);
				});
			})
			.catch(error => {
				console.error(error);
			});
	} catch (error: any) {
		if (error.response?.status === 401) {
			vscode.window.showErrorMessage('The API key and organization ID are not correct or invalid.');
		} else {
			vscode.window.showErrorMessage(error.message);
		}
	}
};

export const createTest = vscode.commands.registerCommand('ntelli-aut.createTest', async () => {
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
					await stream(folderPath, fileName, prompt);
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
