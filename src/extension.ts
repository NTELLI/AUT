import * as vscode from 'vscode';
import { generateUnitTest } from './generate';
import { refactorTest } from './refactor';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(generateUnitTest);
	context.subscriptions.push(refactorTest);
}
