// vi: sts=2 sw=2 et
//
// accelerator setting based on
// https://github.com/ambrice/spatialnavigation-tastycactus.com/blob/master/prefs.js

const Lang = imports.lang;
const Signals = imports.signals;

const Gtk = imports.gi.Gtk;
// const Gio = imports.gi.Gio;
const GObject = imports.gi.GObject;

const Gettext = imports.gettext.domain('gnome-shell-extensions');
const _ = Gettext.gettext;

const Local = imports.misc.extensionUtils.getCurrentExtension();
const Config = Local.imports.config;
const Convenience = Local.imports.convenience;



let _settings;



const ImgurSettingsWidget = new GObject.Class({
  Name: 'ImgurSettingsWidget',
  GTypeName: 'ImgurSettingsWidget',
  Extends: Gtk.Box,

  _init: function (params) {
    this.parent(params);
    this._initLayout();
  },

  _initLayout: function () {
    this._grid = new Gtk.Grid({margin: 8});

    const labelShowIndicator = new Gtk.Label({
      label: _('Show indicator'),
      hexpand: true
    });

    const sliderShowIndicator = new Gtk.Switch({expand: false});

    this._grid.attach(labelShowIndicator, 0, 0, 1, 1);
    this._grid.attach(sliderShowIndicator, 1, 0, 1, 1);



    const clickActionOptions = [
      [_("Select Area")     , Config.ClickActions.SELECT_AREA],
      [_("Select Window")   , Config.ClickActions.SELECT_WINDOW],
      [_("Select Desktop")  , Config.ClickActions.SELECT_DESKTOP],
      [_("Show Menu")       , Config.ClickActions.SHOW_MENU]
    ];

    const labelDefaultClickAction = new Gtk.Label({
      label: _('Default click action'),
      hexpand: true
    });


    const currentClickAction = _settings.get_enum(Config.KeyClickAction);

    const comboBoxDefaultClickAction = this._getComboBox(
      clickActionOptions, GObject.TYPE_INT, currentClickAction,
      function (value) _settings.set_enum(Config.KeyClickAction, value)
    );

    this._grid.attach(labelDefaultClickAction, 0, 1, 1, 1);
    this._grid.attach(comboBoxDefaultClickAction, 1, 1, 1, 1);



    const treeView = this._getShortcutTreeView();
    this._grid.attach(treeView, 0, 2, 2, 4);


    this._grid.show_all();
    this.add(this._grid);
  },

  _getShortcutTreeView: function () {
    let model = new Gtk.ListStore();

    model.set_column_types([
        GObject.TYPE_STRING,
        GObject.TYPE_STRING,
        GObject.TYPE_INT,
        GObject.TYPE_INT
    ]);

    let bindings = [
      ["shortcut-select-area", "Select area"],
      ["shortcut-select-window", "Select window"],
      ["shortcut-select-desktop", "Select whole desktop"]
    ];

    for each (let [name, description] in bindings) {
      log("binding: " + name + " description: " + description);
      let binding = _settings.get_strv(name)[0];

      let key, mods;

      if (binding) {
        [key, mods] = Gtk.accelerator_parse(binding);
      } else {
        [key, mods] = [0, 0];
      }

      let row = model.append();

      model.set(row, [0, 1, 2, 3], [name, description, mods, key]);
    }

    let treeview = new Gtk.TreeView({
        'expand': true,
        'model': model
    });

    let cellrend = new Gtk.CellRendererText();
    let col = new Gtk.TreeViewColumn({
      'title': 'Keyboard Shortcut',
       'expand': true
    });

    col.pack_start(cellrend, true);
    col.add_attribute(cellrend, 'text', 1);
    treeview.append_column(col);

    cellrend = new Gtk.CellRendererAccel({
      'editable': true,
      'accel-mode': Gtk.CellRendererAccelMode.GTK
    });

    cellrend.connect('accel-edited', function(rend, iter, key, mods) {
      let value = Gtk.accelerator_name(key, mods);
      let [succ, iterator] = model.get_iter_from_string(iter);

      if (!succ) {
        throw new Error("Error updating keybinding");
      }

      let name = model.get_value(iterator, 0);

      model.set(iterator, [2, 3], [mods, key]);
      _settings.set_strv(name, [value]);
    });

    cellrend.connect('accel-cleared', function(rend, iter, key, mods) {
      let [succ, iterator] = model.get_iter_from_string(iter);

      if (!succ) {
        throw new Error("Error clearing keybinding");
      }

      let name = model.get_value(iterator, 0);

      model.set(iterator, [2, 3], [0, 0]);
      _settings.set_strv(name, []);
    });

    col = new Gtk.TreeViewColumn({'title': 'Modify', min_width: 200});

    col.pack_end(cellrend, false);
    col.add_attribute(cellrend, 'accel-mods', 2);
    col.add_attribute(cellrend, 'accel-key', 3);
    treeview.append_column(col);

    return treeview;
  },

  _getComboBox: function (options, valueType, defaultValue, callback) {
    let model = new Gtk.ListStore();

    let Columns = { LABEL: 0, VALUE: 1 };

    model.set_column_types([GObject.TYPE_STRING, valueType]);

    let comboBox = new Gtk.ComboBox({model: model});
    let renderer = new Gtk.CellRendererText();

    comboBox.pack_start(renderer, true);
    comboBox.add_attribute(renderer, 'text', 0);

    for each (let [label, value] in options) {
      let iter;

      model.set(
          iter = model.append(),
          [Columns.LABEL, Columns.VALUE],
          [label, value]
      );

      if (value === defaultValue) {
          comboBox.set_active_iter(iter);
      }
    }

    comboBox.connect('changed', function (entry) {
      let [success, iter] = comboBox.get_active_iter();

      if (!success) {
          return;
      }

      let value = model.get_value(iter, Columns.VALUE);

      callback(value);
    });

    return comboBox;
  }
});

function init() {
  _settings = Convenience.getSettings();
}

function buildPrefsWidget() {
  let widget = new ImgurSettingsWidget();
  widget.show_all();

  return widget;
}
