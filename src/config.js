/*jshint moz:true */
// vi: sts=2 sw=2 et

const Secret = imports.gi.Secret;

const IndicatorName = 'de.ttll.ImgurUploader';

const SettingsSchema = 'org.gnome.shell.extensions.imgur';

const OAuthUrl = 'https://api.imgur.com/oauth2/authorize?response_type=token&client_id=';

const KeyEnableIndicator = 'enable-indicator';
const KeyClickAction = 'click-action';
const KeyCopyClipboard = 'copy-clipboard';
const KeyKeepFile = 'keep-file';
const KeyShortcuts = [
  'shortcut-select-area',
  'shortcut-select-window',
  'shortcut-select-desktop'
];
const KeyUsername = 'username';

const ClickActions = {
  SHOW_MENU: 0,
  SELECT_AREA: 1,
  SELECT_WINDOW: 2,
  SELECT_DESKTOP: 3
};

const TokenSchema = new Secret.Schema("org.gnome.shell.extensions.imgur.token",
  Secret.SchemaFlags.NONE,
  {
    "user": Secret.SchemaAttributeType.STRING
  }
);
