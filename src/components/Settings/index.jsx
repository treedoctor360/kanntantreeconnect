// 設定タブ
import ParkManager from './ParkManager.jsx';
import SpeciesManager from './SpeciesManager.jsx';
import SyncPanel from './SyncPanel.jsx';
import PrintSheetPanel from './PrintSheetPanel.jsx';
import BackupPanel from './BackupPanel.jsx';

export default function Settings({ parks, onToast, onParkDeleted, autoOpenPark = false }) {
  return (
    <div className="pane">
      <ParkManager
        parks={parks}
        onToast={onToast}
        onParkDeleted={onParkDeleted}
        autoOpen={autoOpenPark}
      />
      <SpeciesManager onToast={onToast} />
      <PrintSheetPanel parks={parks} onToast={onToast} />
      <SyncPanel onToast={onToast} />
      <BackupPanel onToast={onToast} />
    </div>
  );
}
