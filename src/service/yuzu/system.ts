import * as fs from "fs";
import path from "path";
import { downloadFirmwareWithProgress, downloadMod, getKeysContent } from "../../api/emusak";
import { IEmusakEmulatorConfig, IYuzuConfig } from "../../types";
import electron from "electron";
import Swal from "sweetalert2";
import { asyncExtract } from "../utils";
import { pickOneFolder, readDir } from "../FService";
import Zip from "adm-zip";
import YuzuModel from "../../storage/yuzu";

const getYuzuPath = (config: IEmusakEmulatorConfig = null, ...paths: string[]) => {

  if (config && config.isPortable) {
    return path.resolve(config.path, 'user', ...paths);
  }

  if (!(process.platform === "win32")) {
    /**
     * If user installed yuzu with snap on ubuntu, path in located in ~/snap/yuzu
     */
    const home = electron.remote.app.getPath('home');
    const installedWithSnap = fs.existsSync(path.resolve(home, 'snap', 'yuzu', 'common', '.local', 'share', 'yuzu'));

    if (installedWithSnap) {
      return path.resolve(home, 'snap', 'yuzu', 'common', '.local', 'share', 'yuzu', ...paths);
    }

    return path.resolve(electron.remote.app.getPath('home'), '.local', 'share', 'yuzu', ...paths);
  }

  return path.resolve(electron.remote.app.getPath('appData'), 'yuzu', ...paths);
}

export const isValidFileSystem = async (): Promise<boolean> => {
  const yuzuAppDataPath = fs.promises.access(getYuzuPath(null)).then(() => true).catch(() => false);
  const firmwarePath = getYuzuPath(null, 'nand', 'system', 'Contents', 'registered');
  const keyPath = getYuzuPath(null, 'keys');

  const result = await Promise.all([
    yuzuAppDataPath,
    firmwarePath,
    keyPath
  ]);

  return !result.includes(false);
}

export const installKeysToYuzu = async (config: IEmusakEmulatorConfig = null) => {
  const keysContent = await getKeysContent();
  const keysPath = getYuzuPath(config, 'keys', 'prod.keys');
  await fs.promises.writeFile(keysPath, keysContent, 'utf-8');

  await Swal.fire({
    icon: 'success',
    title: 'Job done!',
    html: `Created or replaced keys at: <code>${keysPath}</code>`,
    width: 600
  });
};

export const installFirmware = async (config: IEmusakEmulatorConfig = null) => {
  const firmwareDestPath = path.resolve((electron.app || electron.remote.app).getPath('temp'), 'firmware.zip');
  const firmwareInstallPath = getYuzuPath(config, 'nand', 'system', 'Contents', 'registered');
  const result = await downloadFirmwareWithProgress(firmwareDestPath);

  if (!result) {
    return;
  }

  await asyncExtract(firmwareDestPath, firmwareInstallPath);
  await fs.promises.unlink(firmwareDestPath);
  await Swal.fire({
    icon: 'success',
    title: 'Job done!',
    html: `Extracted firmware content to <code>${firmwareInstallPath}</code>`,
    width: 600
  });
}

export const getYuzuGames = async (config: IEmusakEmulatorConfig = null) => {

  if (!(process.platform === "win32")) {
    const loadPath = getYuzuPath(config, 'load');

    if (!fs.existsSync(loadPath)) {
      return [];
    }

    const dirents = await readDir(loadPath);
    const games = dirents.filter(d => d.isDirectory()).map(d => d.name.trim().toUpperCase());

    return games.map(g => ({
      id: g,
      shadersCount: 0
    }))
  }

  try {

    const cachePath = getYuzuPath(config, 'cache', 'game_list');
    const dirents = await readDir(cachePath);
    const files = dirents.filter(d => d.isFile()).map(d => d.name.replace('.pv.txt', '').toUpperCase());

    return files.map(f => ({
      id: f,
      shadersCount: 0
    }))
  } catch(e) {
    return [];
  }
}

export const addYuzuFolder = async () => {
  const { value: accept } = await Swal.fire({
    icon: 'info',
    text: 'You must pick a valid yuzu folder where "yuzu.exe" or "yuzu" (for Linux users) is located. You can add multiple yuzu instances by clicking this button again',
    showCancelButton: true,
    cancelButtonText: 'later'
  });

  if (!accept) {
    return false;
  }

  const path = await pickOneFolder();

  if (!path) {
    return false;
  }

  const dirents = await readDir(path);
  const files = dirents.filter(d => d.isFile()).map(d => d.name);

  if (!files.includes('yuzu.exe') && files.includes('yuzu')) {
    Swal.fire({
      icon: 'error',
      text: 'No "yuzu.exe" (or "yuzu" for Linux users) has been found'
    });
    return;
  }

  const folders = dirents.filter(d => !d.isFile()).map(d => d.name.toLowerCase());

  if (!folders.includes('user')) {
    Swal.fire({
      icon: 'error',
      text: 'This is not a portable yuzu path'
    });
    return;
  }

  await YuzuModel.addDirectory({ isPortable: true, path });
}

export const installMod = async (config: IEmusakEmulatorConfig = null, t: string, pickedVersion: string, modName: string, modFileName: string) => {
  const titleID = t.toLocaleLowerCase();
  const kind = modFileName.toLowerCase().includes('.pchtxt') ? 'pchtxt' : 'archive';
  let modPath: string;

  if (kind === 'pchtxt') {
    modPath = getYuzuPath(config, 'load', titleID, modName, 'exefs');
  } else {
    modPath = getYuzuPath(config, 'load', titleID);
  }

  const exists = await fs.promises.access(modPath).then(() => true).catch(() => false);

  if (!exists) {
    await fs.promises.mkdir(modPath, { recursive: true });
  }

  const modBuffer = await downloadMod(titleID.toUpperCase(), pickedVersion, modName, modFileName);

  if (kind === 'pchtxt') {
    await fs.promises.writeFile(path.resolve(modPath, `${modName}.pchtxt`), modBuffer, 'utf-8');
    await fs.promises.chmod(path.resolve(modPath, `${modName}.pchtxt`), 660);
  } else {
    const archive = new Zip(modBuffer);
    archive.extractAllTo(modPath, true);
  }

  await Swal.fire({
    icon: 'success',
    title: 'Job done!',
    html: `Mod installed to <code>${modPath}</code>`
  });
}
