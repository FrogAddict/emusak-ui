import React, { useEffect } from "react";
import {
  Backdrop,
  Box,
  CircularProgress,
  Divider,
  LinearProgress,
  makeStyles,
  Modal,
  Paper,
  Typography
} from "@material-ui/core";
import FeaturesContainer from "./FeaturesContainer";
import RyujinxModel from "../storage/ryujinx";
import {
  addRyujinxFolder,
  makeRyujinxPortable,
  installFirmware,
  listGamesWithNameAndShadersCount,
  downloadKeys, installMod
} from "../service/Ryujinx/system";
import { IEmusakEmulatorConfig, IEmusakMod, IEmusakSaves, IEmusakShaders, IRyujinxConfig } from "../types";
import { getRyujinxShadersCount } from "../api/emusak";
import { installShadersToGame, shareShader } from "../service/Ryujinx/shaders";
import { downloadSave } from "../service/shared/saves";
import electron from "electron";
import { titleIdToName } from "../service/EshopDBService";
import EmulatorHeaderComponent from "../components/EmulatorHeaderComponent";

interface IRyujinxContainerProps {
  threshold: number;
  firmwareVersion: string;
  emusakSaves: IEmusakSaves;
  emusakMods: IEmusakMod[];
}

const useStyles = makeStyles((theme) => ({
  modal: {
    backgroundColor: theme.palette.background.paper,
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: 20,
    width: '50%'
  },
  backdrop: {
    zIndex: theme.zIndex.drawer + 1,
    color: '#fff',
  },
}));

const RyujinxContainer = ({threshold, firmwareVersion, emusakSaves, emusakMods}: IRyujinxContainerProps) => {
  const classes = useStyles();
  const [directories, setDirectories] = React.useState<IEmusakEmulatorConfig[]>([]);
  const [emusakShaders, setEmusakShaders] = React.useState<IEmusakShaders>({});
  const [needsRefresh, setNeedsRefresh] = React.useState(true);
  const [backdropOpen, setBackdropOpen] = React.useState(false);
  const [currentGame, setCurrentGame] = React.useState('');
  const [ryujinxLogsModalOpen, setRyujinxLogsModalOpen] = React.useState(false);
  const [loaded, setLoaded] = React.useState(false);
  const [uploadProgress, setUploadProgress] = React.useState('0');

  const refreshPageData = async () => {
    setTimeout(async () => {
      const configs = await RyujinxModel.getDirectories();
      listGamesWithNameAndShadersCount(configs).then(setDirectories);
      getRyujinxShadersCount().then(setEmusakShaders);
      setLoaded(true);
    }, loaded ? 0 : 500); // Delay rendering to avoid too many tasks on CPU at the same time
  }

  // On component mount
  useEffect(() => {
    needsRefresh && refreshPageData().then(() => setNeedsRefresh(false));
  }, [needsRefresh]);

  const onRyuFolderAdd = async () => {
    await addRyujinxFolder();
    setNeedsRefresh(true);
  }

  const onRyuShadersDownload = async (config: IRyujinxConfig, titleId: string) => {
    await installShadersToGame(config, titleId);
    setNeedsRefresh(true);
  }

  const onRyuConfigRemove = (config: IRyujinxConfig) => {
    RyujinxModel.deleteDirectory(config);
    setNeedsRefresh(true);
  }

  const onPortableButtonClick = async (config: IRyujinxConfig) => {
    await makeRyujinxPortable(config);
    setNeedsRefresh(true);
  }

  const onRyuOpen = () => {
    setRyujinxLogsModalOpen(true);
  }

  const onRyujinxClose = () => {
    setRyujinxLogsModalOpen(false);
    setBackdropOpen(true);
  }

  const onShareFinish = () => {
    setBackdropOpen(false);
  }

  const onUploadProgress = (percentage: string) => {
    console.log({ percentage })
    setUploadProgress(percentage);
  }

  // App is ready once saves, mods and shaders data are fetched, as well with firmware version and threshold values
  const isAppReady = Object.keys(emusakSaves).length > 0
    && threshold
    && firmwareVersion
    && Object.keys(emusakShaders).length > 0
    && emusakMods.length > 0;

  const LinearProgressWithLabel = (props: any) => (
    <Box display="flex" alignItems="center">
      <Box width="100%" mr={1}>
        <LinearProgress variant="determinate" {...props} />
      </Box>
      <Box style={{ textAlign: 'right' }} minWidth={140}>
        <Typography variant="body2" color="textSecondary">{Math.round(props.value)}% {props.downloadSpeed ? 'at ' + props.downloadSpeed + 'MB/s' : ''}</Typography>
      </Box>
    </Box>
  );

  return (
    <Box p={3}>
      <EmulatorHeaderComponent
        threshold={threshold}
        onFolderAdd={onRyuFolderAdd}
      />
      <br/>
      <Divider/>
      <br/>

      <Backdrop className={classes.backdrop} open={backdropOpen} onClick={() => {
      }}>
        <Paper style={{ padding: '20px 50px' }}>
          <p style={{ textAlign: 'center' }}>
            <img src="https://media4.giphy.com/media/00ECf99y9SaiHt8gFt/giphy.gif?cid=ecf05e47hj6ca8qa1fvciiq54ev6t6ggczqfhra14ipcz64n&rid=giphy.gif&ct=g" alt=""/>
          </p>
          <br />
          <h3>&nbsp; Uploading shaders to AnonFiles. This can take up to a few minutes depending on shader size and AnonFile's load.</h3>
          <br/>
          <LinearProgressWithLabel variant="buffer" value={parseFloat(uploadProgress) as any} valueBuffer={0} />
        </Paper>
      </Backdrop>

      <Modal
        open={ryujinxLogsModalOpen}
        onClose={() => {
        }}
        aria-labelledby="simple-modal-title"
        aria-describedby="simple-modal-description"
      >
        <div className={classes.modal}>
          <h2 style={{textAlign: 'center', fontWeight: 'normal'}}>Please run <b>{currentGame}</b> in Ryujinx !</h2>

          <ul style={{listStyle: 'none'}}>
            <li style={{display: 'flex', alignItems: 'center'}}>
              <span> <CircularProgress color="secondary" size={30}/></span>
              &nbsp;
              &nbsp;
              <span> Waiting for <b>{currentGame}</b> to be run in ryujinx</span>
            </li>
            <li style={{display: 'flex', alignItems: 'center'}}>
              <span> <CircularProgress color="secondary" size={30}/></span>
              &nbsp;
              &nbsp;
              <span> Waiting for shaders to be compiled</span>
            </li>
          </ul>
        </div>
      </Modal>

      {
        (directories.length === 0 && isAppReady) && (
          <Box style={{textAlign: 'center'}}>
            <h3>Add a Ryujinx directory by clicking the button above.</h3>
          </Box>
        )
      }

      {
        (isAppReady)
          ? directories.map(config => {
            const conf = { path: config.path, isPortable: config.isPortable, games: config.games };
            return (
              <FeaturesContainer
                config={conf}
                key={`ryu-${conf.path}`}
                onFirmwareDownload={installFirmware}
                firmwareVersion={firmwareVersion}
                onKeysDownload={() => downloadKeys(conf)}
                emusakShaders={emusakShaders}
                onShadersDownload={id => onRyuShadersDownload(conf, id)}
                onEmuConfigDelete={onRyuConfigRemove}
                emusakSaves={emusakSaves}
                emusakMods={emusakMods}
                threshold={threshold}
                emulator="ryu"
                onRefresh={() => refreshPageData()}
                onSaveDownload={downloadSave}
                onShareShaders={(titleId: string, localCount: number, emusakCount: number) => {
                  setCurrentGame(titleIdToName(titleId));
                  shareShader(conf, titleId, localCount, emusakCount, onRyuOpen, onRyujinxClose, onUploadProgress, onShareFinish);
                }}
                onModsDownload={(titleId: string, version: string, modName: string, modId: string) => installMod(conf, titleId, version, modName, modId)}
                onPortableButtonClick={() => onPortableButtonClick(conf)}
                isValid={true}
              />
            );
          })
          : (
            <Box mt={3} style={{textAlign: 'center'}}>
              <CircularProgress/>
              <br/>
              <br/>
              <h3>Loading data from EmuSAK. If this process never finishes, EmuSAK might be temporary down or something is
                wrong with your network.</h3>
              <h4>You can check EmuSAK's status by clicking this link <a href="#" onClick={() => electron.shell.openExternal("https://emusak.betteruptime.com/")}>https://emusak.betteruptime.com</a>
              </h4>
            </Box>
          )
      }
    </Box>
  );
};

export default RyujinxContainer;
