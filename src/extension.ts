import * as vscode from 'vscode';

// Gemini API response type
interface GeminiResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{ text?: string }>
        }
    }>;
}

// ----------------------------
// Utility: Detect language support (demo)
// ----------------------------
interface LanguageSupport {
    name: string;
    extensions: string[];
    functionPattern: RegExp;
    classPattern: RegExp;
    commentStyle: string;
}

const SUPPORTED_LANGUAGES: { [key: string]: LanguageSupport } = {
    python: {
        name: 'Python',
        extensions: ['.py', '.pyw'],
        functionPattern: /def\s+(\w+)/g,
        classPattern: /class\s+(\w+)/g,
        commentStyle: '# Multi-language AI comment:'
    },
    javascript: {
        name: 'JavaScript',
        extensions: ['.js', '.jsx', '.mjs'],
        functionPattern: /function\s+(\w+)|const\s+(\w+)\s*=/g,
        classPattern: /class\s+(\w+)/g,
        commentStyle: '// Multi-language AI comment:'
    },
    typescript: {
        name: 'TypeScript', 
        extensions: ['.ts', '.tsx'],
        functionPattern: /function\s+(\w+)|const\s+(\w+)\s*=/g,
        classPattern: /class\s+(\w+)|interface\s+(\w+)/g,
        commentStyle: '// Multi-language AI comment:'
    },
    java: {
        name: 'Java',
        extensions: ['.java'],
        functionPattern: /\w+\s+(\w+)\s*\(/g,
        classPattern: /class\s+(\w+)|interface\s+(\w+)/g,
        commentStyle: '// Multi-language AI comment:'
    },
    cpp: {
        name: 'C++',
        extensions: ['.cpp', '.cc', '.cxx', '.h', '.hpp'],
        functionPattern: /\w+\s+(\w+)\s*\(/g,
        classPattern: /class\s+(\w+)|struct\s+(\w+)/g,
        commentStyle: '// Multi-language AI comment:'
    },
    // ... other languages same as before
};

function getLanguageSupport(document: vscode.TextDocument): LanguageSupport | undefined {
    const langId = document.languageId;
    if (SUPPORTED_LANGUAGES[langId]) {
        return SUPPORTED_LANGUAGES[langId];
    }
    const ext = document.fileName.split('.').pop()?.toLowerCase();
    for (const [, config] of Object.entries(SUPPORTED_LANGUAGES)) {
        if (config.extensions.some(e => e.endsWith(ext || ''))) {
            return config;
        }
    }
    return undefined;
}

// ----------------------------
// Gemini API: Generate comments
// ----------------------------
async function generateAIComment(code: string, apiKey: string, style: string): Promise<string> {
    const config = vscode.workspace.getConfiguration('aiCommenter');
    const model = config.get<string>('model', 'gemini-2.0-pro');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey
        },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        {
                            text: `Add ${style} code comments to the following code. Keep the original code intact:\n\n${code}`
                        }
                    ]
                }
            ]
        })
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.[0]?.text || code;
}

// ----------------------------
// Command: Comment Current File
// ----------------------------
async function commentCurrentFile() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage('No active editor found');
        return;
    }

    const languageSupport = getLanguageSupport(editor.document);
    if (!languageSupport) {
        vscode.window.showErrorMessage(`Language ${editor.document.languageId} is not supported yet.`);
        return;
    }

    const config = vscode.workspace.getConfiguration('aiCommenter');
    const apiKey = config.get<string>('apiKey', '');
    if (!apiKey) {
        vscode.window.showErrorMessage("⚠️ Please set your Gemini API key in settings.json");
        return;
    }

    const style = config.get('commentStyle', 'professional');
    const code = editor.document.getText();

    try {
        const modifiedCode = await generateAIComment(code, apiKey, style);

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            editor.document.positionAt(0),
            editor.document.positionAt(code.length)
        );
        edit.replace(editor.document.uri, fullRange, modifiedCode);
        await vscode.workspace.applyEdit(edit);

        vscode.window.showInformationMessage(`✅ AI comments added successfully!`);
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

// ----------------------------
// Command: List available models
// ----------------------------
async function listAvailableModels(apiKey: string): Promise<string[]> {
    const url = "https://generativelanguage.googleapis.com/v1beta/models";

    const response = await fetch(url, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "X-goog-api-key": apiKey
        }
    });

    if (!response.ok) {
        throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return (data.models || []).map((m: any) => m.name.replace("models/", ""));
}

// ----------------------------
// Command: Select Model
// ----------------------------
async function selectModel() {
    const config = vscode.workspace.getConfiguration('aiCommenter');
    const apiKey = config.get<string>('apiKey', '');

    if (!apiKey) {
        vscode.window.showErrorMessage("⚠️ Please set your Gemini API key in settings.json first.");
        return;
    }

    try {
        const models = await listAvailableModels(apiKey);

        if (!models.length) {
            vscode.window.showWarningMessage("No Gemini models available for this API key.");
            return;
        }

        const picked = await vscode.window.showQuickPick(models, {
            placeHolder: "Select a Gemini model"
        });

        if (picked) {
            await config.update('model', picked, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`✅ Gemini model set to: ${picked}`);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Error fetching models: ${err.message}`);
    }
}

// ----------------------------
// Show Supported Languages
// ----------------------------
async function showSupportedLanguages() {
    const panel = vscode.window.createWebviewPanel(
        'supportedLanguages',
        'AI Code Commenter - Supported Languages',
        vscode.ViewColumn.One,
        {}
    );

    panel.webview.html = `
        <html>
        <body>
            <h1>🌐 Supported Programming Languages</h1>
            <ul>
            ${Object.entries(SUPPORTED_LANGUAGES).map(
                ([, config]) =>
                    `<li><b>${config.name}</b> (${config.extensions.join(', ')})</li>`
            ).join('')}
            </ul>
        </body>
        </html>
    `;
}

// ----------------------------
// Extension activate
// ----------------------------
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('aiCommenter.commentCurrentFile', commentCurrentFile),
        vscode.commands.registerCommand('aiCommenter.showSupportedLanguages', showSupportedLanguages),
        vscode.commands.registerCommand('aiCommenter.selectModel', selectModel)
    );

    vscode.window.showInformationMessage(
        'AI Code Commenter Multi-Language activated!',
        'Show Languages',
        'Comment Current File',
        'Select Model'
    ).then(selection => {
        if (selection === 'Show Languages') {
            vscode.commands.executeCommand('aiCommenter.showSupportedLanguages');
        } else if (selection === 'Comment Current File') {
            vscode.commands.executeCommand('aiCommenter.commentCurrentFile');
        } else if (selection === 'Select Model') {
            vscode.commands.executeCommand('aiCommenter.selectModel');
        }
    });

    console.log('AI Code Commenter Multi-Language extension is active!');
}

export function deactivate() {}
