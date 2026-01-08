import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  // 🔹 Crear carpeta global de templates si no existe
  const templatesUri = vscode.Uri.joinPath(context.globalStorageUri, 'templates');
  vscode.workspace.fs.createDirectory(templatesUri);

  const disposable = vscode.commands.registerCommand('easy-file.createFile', async () => {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showErrorMessage('No workspace folder open');
      return;
    }

    const rootUri = vscode.workspace.workspaceFolders[0].uri;

    // 1️⃣ Selección de carpeta final
    let folderUri: vscode.Uri | undefined = await pickFolderFinal(rootUri);
    if (!folderUri) {return;}

    // 2️⃣ Pedir nombre del archivo con ESC para volver
    let fileName: string | 'back' | undefined;
    do {
      fileName = await askFileName(folderUri);
      if (fileName === 'back') {
        folderUri = await pickFolderFinal(vscode.workspace.workspaceFolders![0].uri);
        if (!folderUri) {return;}
      }
    } while (fileName === 'back');

    if (!fileName) {return;}

    // 3️⃣ Crear archivo con template
    const fileUri = vscode.Uri.joinPath(folderUri, fileName);
    const ext = path.extname(fileName);
    const content = await getTemplate(context, ext);

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content));

    // 4️⃣ Abrir archivo automáticamente
    const doc = await vscode.workspace.openTextDocument(fileUri);
    vscode.window.showTextDocument(doc);
  });

  const openTemplates = vscode.commands.registerCommand('easy-file.openTemplates', async () => {
  // Carpeta global de templates
  const globalTemplates = vscode.Uri.joinPath(context.globalStorageUri, 'templates');

  // Revisar si existe ruta personalizada en configuración
  const userPathSetting = vscode.workspace.getConfiguration('easy-file').get<string>('templatesPath');
  const templatesUri = userPathSetting ? vscode.Uri.file(userPathSetting) : globalTemplates;

  // Crear carpeta si no existe
  try {
    await vscode.workspace.fs.createDirectory(templatesUri);
  } catch {}

  // Abrir en VS Code
  vscode.commands.executeCommand('vscode.openFolder', templatesUri, true);
});
context.subscriptions.push(openTemplates);
  context.subscriptions.push(disposable);
}

export function deactivate() {}

// Función para navegar carpetas con QuickPick
async function pickFolderFinal(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
  while (true) {
    const children = await vscode.workspace.fs.readDirectory(uri);
    const folders = children
      .filter(([name, type]) => type === vscode.FileType.Directory)
      .map(([name]) => name);

    const items: vscode.QuickPickItem[] = [
  { label: '✅ Use this folder', description: uri.fsPath },
  { label: '📁 New folder', description: '' },
  { label: '──────────────────────────────────────────────────────────────────────────────────────────────────', description: '' },
  // Subir de nivel solo si no estamos en la raíz
  ...(vscode.workspace.workspaceFolders && uri.fsPath !== vscode.workspace.workspaceFolders[0].uri.fsPath
      ? [{ label: '..', description: 'Go up one level' }]
      : []),
  ...folders.map(f => ({ label: `$(folder) ${f}`, description: '' }))
];


    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: 'Browse or select folder',
      ignoreFocusOut: true,
      canPickMany: false,
    });

    if (!choice) {return undefined;} // ESC → salir

    // Opciones fijas
    if (choice.label === '✅ Use this folder') {
      return uri;
    }

    if (choice.label === '📁 New folder') {
      const newFolderName = await vscode.window.showInputBox({
        prompt: 'New folder name',
        ignoreFocusOut: true,
      });
      if (!newFolderName) {continue;}
      const newFolderUri = vscode.Uri.joinPath(uri, newFolderName);
      await vscode.workspace.fs.createDirectory(newFolderUri);

      // 🔹 seguir flujo dentro de la carpeta recién creada
      uri = newFolderUri;
      continue;
    }

    if (choice.label.startsWith('────────────────')) {
      continue; // separador
    }

    // Carpeta existente → navegar dentro
    const folderName = choice.label.replace('$(folder) ', '').trim();
    uri = vscode.Uri.joinPath(uri, folderName);
  }
}

// Pedir nombre del archivo con ESC para volver a selección de carpeta
async function askFileName(folderUri: vscode.Uri): Promise<string | 'back' | undefined> {
  const fileName = await vscode.window.showInputBox({
    prompt: 'File name with extension (ESC to cancel)',
    placeHolder: 'Component.vue',
    ignoreFocusOut: true,
  });

  if (fileName === undefined) {return 'back';}
  return fileName;
}

// Obtener template dinámico global del usuario con fallback
async function getTemplate(context: vscode.ExtensionContext, ext: string): Promise<string> {
  // 1️⃣ Carpeta global de la extensión
  const globalTemplates = vscode.Uri.joinPath(context.globalStorageUri, 'templates');
  const templateFile = vscode.Uri.joinPath(globalTemplates, `template${ext}`);

  // 2️⃣ Revisar si usuario configuró otra ruta en settings.json
  const userPathSetting = vscode.workspace.getConfiguration('easy-file').get<string>('templatesPath');
  const userTemplateFile = userPathSetting ? vscode.Uri.file(path.join(userPathSetting, `template${ext}`)) : undefined;

  try {
    if (userTemplateFile) {
      const content = await vscode.workspace.fs.readFile(userTemplateFile);
      return content.toString();
    }

    const content = await vscode.workspace.fs.readFile(templateFile);
    return content.toString();
  } catch (err) {
    return '';
  }
}
