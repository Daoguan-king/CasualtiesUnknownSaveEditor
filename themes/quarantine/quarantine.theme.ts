// The quarantine theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in quarantine.settings.json and the generated quarantine.settings.ts;
// change them with `astryx experimental theme editor set quarantine ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {quarantineSettings} from './quarantine.settings';

export const quarantineTheme = defineTheme({
  extends: quarantineSettings,
  name: 'quarantine',
});
