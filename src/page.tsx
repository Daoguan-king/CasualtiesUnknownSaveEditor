/* 页面入口：单页应用，构建期由 astryx experimental export 渲染成单个 HTML */
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug, themeModes} from './astryx-themes';
import App from './app/App';

export default function Page() {
  return (
    <Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug] ?? 'dark'}>
      <App />
    </Theme>
  );
}
