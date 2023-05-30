import * as vscode from 'vscode';
import { refactorTest } from './refactor';
import { createTest } from './stream';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(refactorTest, createTest);
}
