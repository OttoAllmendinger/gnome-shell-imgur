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
const Shell = imports.gi.Shell;
const Clutter = imports.gi.Clutter;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const Screenshot = imports.ui.screenshot;
const MessageTray = imports.ui.messageTray;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();

const Uploader = Extension.imports.Uploader;



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
        'captured-event', Lang.bind(this, this._onCaptureEvent)
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

  _init: function (options) {
    this.parent(null, IndicatorName);

    this._options = options;

    this._selectionBox = null;

    this._notificationService = new NotificationService();

    this._icon = new St.Icon({
      icon_name: DefaultIcon,
      style_class: 'system-status-icon'
    });

    this.actor.add_actor(this._icon);

    this.actor.connect('button-press-event', Lang.bind(this, this._selectArea));
    this.actor.connect('enter-event', Lang.bind(this, this._hoverIcon));
    this.actor.connect('leave-event', Lang.bind(this, this._resetIcon));
  },

  _hoverIcon: function () {
    this._icon.icon_name = HoverIcon;
  },

  _resetIcon: function () {
    if (!this._selectionBox) {
      this._icon.icon_name = DefaultIcon;
    }
  },

  _selectArea: function () {
    this._selectionBox = new SelectionBox();
    this._hoverIcon();

    this._selectionBox.connect("select", Lang.bind(this, function (obj, box) {
      if ((box.w > 8) && (box.h > 8)) {
        this._uploadScreenshot(box);
      } else {
        var n = this._notificationService.make();
        this._notificationService.setError(n, _(
            "selected region was too small - please select a larger area"
        ));
      }
    }));

    this._selectionBox.connect("stop", Lang.bind(this, function () {
      this._selectionBox = null;
      this._resetIcon();
    }));
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
        Lang.bind(this, function () {
          uploader.upload(fileName);
        })
    );

    uploader.connect('progress',
        Lang.bind(this, function (obj, bytes, total) {
          this._notificationService.setProgress(notification, bytes, total);
        })
    );

    uploader.connect('done',
        Lang.bind(this, function (obj, data) {
          this._notificationService.setFinished(notification, data.link);
          cleanup();
        })
    );

    uploader.connect('error',
        Lang.bind(this, function (obj, error) {
          this._notificationService.setError(notification, error);
          cleanup();
        })
    );
  },

  destroy: function () {
    this.parent();
  }
});



let _indicator;

function init() {
  let theme = imports.gi.Gtk.IconTheme.get_default();
  theme.append_search_path(Extension.path + '/icons');
}

function enable() {
  _indicator = new Indicator();
  Main.panel.addToStatusArea(IndicatorName, _indicator);
}

function disable() {
  _indicator.destroy();
  _indicator = null;
}
