const Lang = imports.lang;

const St = imports.gi.St;
const Gio = imports.gi.Gio;

const Main = imports.ui.main;
const MessageTray = imports.ui.messageTray;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const ExtensionUtils = imports.misc.extensionUtils;
const Local = ExtensionUtils.getCurrentExtension();

const NotificationIcon = 'imgur-uploader-color';
const NotificationSourceName = 'ImgurUploader';




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

