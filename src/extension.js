// vi: sts=2 sw=2 et
//
// props to
// https://github.com/rjanja/desktop-capture
// https://github.com/DASPRiD/gnome-shell-extension-area-screenshot

const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const Gio = imports.gi.Gio;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const Main = imports.ui.main;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Local = ExtensionUtils.getCurrentExtension();

const Config = Local.imports.config;
const Uploader = Local.imports.uploader;
const Indicator = Local.imports.indicator;
const Selection = Local.imports.selection;
const Notifications = Local.imports.notifications;

const Convenience = Local.imports.convenience;




const Extension = new Lang.Class({
  Name: "ImgurUploader",

  _init: function () {
    this.settings = Convenience.getSettings();

    this._notificationService = new Notifications.NotificationService();

    this._signalSettings = [];

    this._signalSettings.push(this.settings.connect(
        'changed::' + Config.KeyEnableIndicator,
        this._updateIndicator.bind(this)
    ));

    this._updateIndicator();

    this._setKeybindings();
  },

  _setKeybindings: function () {
    for each (let shortcut in Config.KeyShortcuts) {
      Main.wm.addKeybinding(
          shortcut,
          this.settings,
          Meta.KeyBindingFlags.NONE,
          Shell.KeyBindingMode.NORMAL,
          this.onAction.bind(this, shortcut.replace('shortcut-', ''))
      );
    }
  },

  _unsetKeybindings: function () {
    for each (let shortcut in Config.KeyShortcuts) {
      Main.wm.removeKeybinding(shortcut);
    }
  },

  _createIndicator: function () {
    if (!this._indicator) {
      this._indicator = new Indicator.Indicator(this);
      Main.panel.addToStatusArea(Config.IndicatorName, this._indicator);
    }
  },

  _destroyIndicator: function () {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  },

  _updateIndicator: function () {
    if (this.settings.get_boolean(Config.KeyEnableIndicator)) {
      this._createIndicator();
    } else {
      this._destroyIndicator();
    }
  },

  _startSelection: function (selection) {
    if (this._selection) {
      // prevent reentry
      return;
    };

    this._selection = selection;

    if (this._indicator) {
      this._indicator.startSelection();
    }

    this._selection.connect("screenshot", function (selection, fileName) {
      this._uploadScreenshot(fileName, /* deleteAfterUpload */ true);
    }.bind(this));

    this._selection.connect("error", function (selection, message) {
      var n = _extension._notificationService.make();
      this._notificationService.setError(n, message)
    }.bind(this));

    this._selection.connect("stop", function () {
      this._selection = null;

      if (this._indicator) {
        this._indicator.stopSelection();
      }
    }.bind(this));
  },

  _selectArea: function () {
    this._startSelection(new Selection.SelectionArea());
  },

  _selectWindow: function() {
    this._startSelection(new Selection.SelectionWindow());
  },

  _selectDesktop: function () {
    this._startSelection(new Selection.SelectionDesktop());
  },

  _uploadScreenshot: function (fileName, deleteAfterUpload) {
    let uploader = new Uploader.ImgurUploader();
    // let uploader = new Uploader.DummyUploader();

    let notification = this._notificationService.make();

    let cleanup = function () {
      if (deleteAfterUpload) {
        Gio.File.new_for_path(fileName).delete(/* cancellable */ null);
      }
      uploader.disconnectAll();
    };

    uploader.connect('progress',
        function (obj, bytes, total) {
          this._notificationService.setProgress(notification, bytes, total);
        }.bind(this)
    );

    uploader.connect('done',
        function (obj, data) {
          this._notificationService.setFinished(notification, data.link);
          cleanup();
        }.bind(this)
    );

    uploader.connect('error',
        function (obj, error) {
          this._notificationService.setError(notification, error);
          cleanup();
        }.bind(this)
    );

    uploader.upload(fileName);
  },


  onAction: function (action) {
    let dispatch = {
      'select-area': this._selectArea.bind(this),
      'select-window': this._selectWindow.bind(this),
      'select-desktop': this._selectDesktop.bind(this)
    };

    let f = dispatch[action] || function () {
      throw new Error('unknown action: ' + action);
    };

    try {
      f();
    } catch (ex) {
      let notification = this._notificationService.make();
      this._notificationService.setError(notification, ex.toString());
    }
  },

  destroy: function () {
    this._destroyIndicator();
    this._unsetKeybindings();

    this._signalSettings.forEach(function (signal) {
      this.settings.disconnect(signal);
    }.bind(this));

    this.disconnectAll();
  }
});

Signals.addSignalMethods(Extension.prototype);



let _extension;

function init() {
  let theme = imports.gi.Gtk.IconTheme.get_default();
  theme.append_search_path(Local.path + '/icons');
}

function enable() {
  _extension = new Extension();
}

function disable() {
  _extension.destroy();
  _extension = null;
}
