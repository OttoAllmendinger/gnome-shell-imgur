// vi: sts=2 sw=2 et
//
// props to
// https://github.com/rjanja/desktop-capture
// https://github.com/DASPRiD/gnome-shell-extension-area-screenshot

const Lang = imports.lang;
const Signals = imports.signals;
const Mainloop = imports.mainloop;

const St = imports.gi.St;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Screenshot = imports.ui.screenshot;
const MessageTray = imports.ui.messageTray;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Local = ExtensionUtils.getCurrentExtension();

const Convenience = Local.imports.convenience;
const Uploader = Local.imports.Uploader;
const Config = Local.imports.config;



const IndicatorName = 'de.ttll.ImgurUploader';
const DefaultIcon = 'imgur-uploader-symbolic';
const HoverIcon = 'imgur-uploader-color';
const NotificationIcon = 'imgur-uploader-color';
const NotificationSourceName = 'ImgurUploader';
const FileTemplate = 'gnome-shell-imgur-XXXXXX.png';



const getBox = function (x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x1 - x2),
    h: Math.abs(y1 - y2)
  };
}

const SelectionBox = new Lang.Class({
  Name: "ImgurUploader.SelectionBox",

  _init: function () {
    this._mouseDown = false;

    this._container = new Shell.GenericContainer({
      name: 'area-selection',
      style_class: 'area-selection',
      visible:  'true',
      reactive: 'true',
      x: -10,
      y: -10
    });

    Main.uiGroup.add_actor(this._container);

    if (Main.pushModal(this._container)) {
      global.set_cursor(Shell.Cursor.CROSSHAIR);
      this._signalCapturedEvent  = global.stage.connect(
        'captured-event', this._onCaptureEvent.bind(this)
      );
    } else {
      log("Main.pushModal() === false");
    }
  },

  _onCaptureEvent: function (actor, event) {
    let type = event.type();

    let [x, y, mask] = global.get_pointer();

    if (type === Clutter.EventType.KEY_PRESS) {
      if (event.get_key_symbol() === Clutter.Escape) {
        this._stop();
      }
    } else if (type === Clutter.EventType.BUTTON_PRESS) {
      [this._startX, this._startY] = [x, y];
      this._mouseDown = true;
    } else if (this._mouseDown) {
      this._box = getBox(this._startX, this._startY, x, y);

      if (type === Clutter.EventType.MOTION) {
        this._drawContainer(this._box);
      } else if (type === Clutter.EventType.BUTTON_RELEASE) {
        this._mouseDown = false;
        this.emit("select", this._box);
        this._stop();
      }
    }
  },

  _drawContainer: function({x, y, w, h}) {
    this._container.set_position(x, y);
    this._container.set_size(w, h);
  },

  _stop: function () {
    global.stage.disconnect(this._signalCapturedEvent);
    global.unset_cursor();
    Main.uiGroup.remove_actor(this._container);
    Main.popModal(this._container);
    this._container.destroy();
    this.emit("stop");
    this.disconnectAll();
  }
});

Signals.addSignalMethods(SelectionBox.prototype);



const NotificationService = new Lang.Class({
  Name: "ImgurUploader.NotificationService",

  _init: function () {
    this._notificationSource = new MessageTray.Source(
      NotificationSourceName, NotificationIcon
    );
    this._notifications = [];
  },

  make: function () {
    let n = new MessageTray.Notification(
        this._notificationSource, _("Upload")
    );

    Main.messageTray.add(this._notificationSource);
    this._notificationSource.notify(n);
    return n;
  },

  setProgress: function (notification, bytes, total) {
    notification.update(
        _("Upload"),
        '' + Math.floor(100 * (bytes / total)) + '%'
    );

    // this._notificationSource.notify(notification);
  },

  setFinished: function (notification, url) {
    notification.setResident(true);

    notification.update(_("Upload Complete"), url);
    notification.addButton('copy', _("Copy Link"));

    notification.connect('action-invoked', function (n, action) {
      if (action === 'copy') {
        St.Clipboard.get_default().set_text(St.ClipboardType.PRIMARY, url);
        St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, url);
      }
    });

    this._notificationSource.notify(notification);
  },

  setError: function (notification, error) {
    notification.setResident(true);

    notification.update(
        _("Upload Error"),
        error,
        { secondaryGIcon: new Gio.ThemedIcon({name: 'dialog-error'}) }
    );

    this._notificationSource.notify(notification);
  }
});



const Indicator = new Lang.Class({
  Name: "ImgurUploader.Indicator",
  Extends: PanelMenu.Button,

  _init: function (extension) {
    this.parent(null, IndicatorName);

    this._signalSettings = [];

    this._icon = new St.Icon({
      icon_name: DefaultIcon,
      style_class: 'system-status-icon'
    });

    this.actor.add_actor(this._icon);
    this.actor.connect('enter-event', this.hoverIcon.bind(this));
    this.actor.connect('leave-event', this.resetIcon.bind(this));

    this._signalSettings.push(_settings.connect(
        'changed::' + Config.KeyClickAction,
        this._updateButton.bind(this)
    ));

    this._updateButton();
  },

  _updateButton: function () {
    const action = _settings.get_enum(Config.KeyClickAction);

    if (action === Config.ClickActions.SHOW_MENU) {
      this._disableClickAction();
      this._enableMenu()
    } else {
      this._disableMenu();
      this._enableClickAction();
    }
  },

  _enableClickAction: function () {
    this._signalButtonPressEvent = this.actor.connect(
      'button-press-event',
      function () {
        for each (let a in arguments) log(String(a));
      }.bind(this)
    );
  },

  _disableClickAction: function () {
    let (signal = this._signalButtonPressEvent) {
      if (signal) {
        this.actor.disconnect(signal);
      }
    }
  },

  _enableMenu: function () {
    const items = [
      ["select-area", _("Select Area")],
      ["select-window", _("Select Window")],
      ["select-desktop", _("Select Desktop")]
    ];

    for each (let [key, title] in items) {
      let item = new PopupMenu.PopupMenuItem(title);
      this.menu.addMenuItem(item);
    }
  },

  _disableMenu: function () {
    this.menu.removeAll();
  },

  hoverIcon: function () {
    this._icon.icon_name = HoverIcon;
  },

  resetIcon: function () {
    if (!this._selectionBox) {
      this._icon.icon_name = DefaultIcon;
    }
  },

  destroy: function () {
    this.parent();
    this._signalSettings.forEach(function (signal) {
      _settings.disconnect(signal);
    });
  }
});



const Extension = new Lang.Class({
  Name: "ImgurUploader",

  _init: function () {
    this._selectionBox = null;
    this._notificationService = new NotificationService();

    this._signalSettings = [];

    for each (let shortcut in Config.KeyShortcuts) {
      Main.wm.addKeybinding(
          shortcut,
          _settings,
          Meta.KeyBindingFlags.NONE,
          Shell.KeyBindingMode.NORMAL,
          this._onShortcut.bind(shortcut)
      );
    }

    this._signalSettings.push(_settings.connect(
        'changed::' + Config.KeyEnableIndicator,
        this._updateIndicator.bind(this)
    ));

    this._updateIndicator();
  },

  _onShortcut: function () {
    for each (let a in arguments) log(a);
  },

  _createIndicator: function () {
    if (!this._indicator) {
      this._indicator = new Indicator(this);
      Main.panel.addToStatusArea(IndicatorName, this._indicator);
    }
  },

  _destroyIndicator: function () {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }
  },

  _updateIndicator: function () {
    if (_settings.get_boolean(Config.KeyEnableIndicator)) {
      this._createIndicator();
    } else {
      this._destroyIndicator();
    }
  },

  _selectArea: function () {
    if (this._selectionBox) {
      // prevent reentry
      return;
    };

    this._selectionBox = new SelectionBox();

    if (this._indicator) {
      this._indicator.hoverIcon();
    }

    this._selectionBox.connect("select", function (obj, box) {
      if ((box.w > 8) && (box.h > 8)) {
        this._uploadScreenshot(box);
      } else {
        var n = this._notificationService.make();
        this._notificationService.setError(n, _(
            "selected region was too small - please select a larger area"
        ));
      }
    }.bind(this));

    this._selectionBox.connect("stop", function () {
      this._selectionBox = null;

      if (this._indicator) {
        this._indicator.resetIcon();
      }
    }.bind(this));
  },

  _uploadScreenshot: function ({x, y, w, h}) {
    let [fileHandle, fileName] = GLib.file_open_tmp(FileTemplate);
    let screenshot = new Shell.Screenshot();
    let uploader = new Uploader.ImgurUploader();
    // let uploader = new Uploader.DummyUploader();

    let notification = this._notificationService.make();

    let cleanup = function () {
      Gio.File.new_for_path(fileName).delete(/* cancellable */ null);
      uploader.disconnectAll();
    };

    screenshot.screenshot_area(x, y, w, h, fileName,
        function () {
          uploader.upload(fileName);
        }.bind(this)
    );

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
  },

  destroy: function () {
    this._destroyIndicator();
    this.disconnectAll();

    this._signalSettings.forEach(function (signal) {
      _settings.disconnect(signal);
    });
  }
});

Signals.addSignalMethods(Extension.prototype);



let _extension;
let _settings;

function init() {
  let theme = imports.gi.Gtk.IconTheme.get_default();
  theme.append_search_path(Local.path + '/icons');

  _settings = Convenience.getSettings();
}

function enable() {
  _extension = new Extension();
}

function disable() {
  _extension.destroy();
  _extension = null;
}
