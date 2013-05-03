// vi: sw=2 sts=2
const Lang = imports.lang;
const Signals = imports.signals;

const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const Mainloop = imports.mainloop;

const _clientId = "c5c1369fb46f29e";

const _httpSession = new Soup.SessionAsync();


const Uploader = new Lang.Class({
  Name: "Uploader",
  _init: function () true
});

Signals.addSignalMethods(Uploader.prototype);




const ImgurUploader = new Lang.Class({
  Name: "ImgurUploader",
  Extends: Uploader,

  baseUrl: "https://api.imgur.com/3/",

  _init: function (clientId) {
    this._clientId = clientId;
  },

  _getMimetype: function (filename) {
    return 'image/jpeg'; // FIXME
  },

  _getPostMessage: function (filename, callback) {
    let url = this.baseUrl + "image";
    let file = Gio.File.new_for_path(filename);

    file.load_contents_async(null, Lang.bind(this, function (f, res) {
      let contents;

      try {
        [, contents] = f.load_contents_finish(res);
      } catch (e) {
        log("error loading file: " + e.message);
        callback(e, null);
        return;
      }

      let buffer = new Soup.Buffer(contents, contents.length);
      let mimetype = this._getMimetype(filename);
      let multipart = new Soup.Multipart(Soup.FORM_MIME_TYPE_MULTIPART);
      multipart.append_form_file('image', filename, mimetype, buffer);

      let message = Soup.form_request_new_from_multipart(url, multipart);

      message.request_headers.append(
        "Authorization", "Client-ID " + this._clientId
      );

      callback(null, message);
    }), null);
  },


  upload: function (filename) {
    this.emit('start');

    this._getPostMessage(filename, Lang.bind(this, function (error, message) {
      if (error) {
        this.emit("error", error);
        return;
      }

      _httpSession.queue_message(message,
        Lang.bind(this, function (session, response) {
          if (response.status_code == 200) {
            this.emit('data', JSON.parse(response.response_body.data));
          } else {
            log('getJSON error url: ' + url);
            log('getJSON error status code: ' + response.status_code);
            log('getJSON error response: ' + response.response_body.data);
            this.emit('error', response.status_code, response);
          }
      }));
    }));
  }
});



if (this['ARGV'] !== undefined) {
    // run by gjs
    log("command line");

    let uploader = new ImgurUploader(_clientId);

    uploader.connect("data", function (obj, data) {
      log(JSON.stringify(data));
    });

    uploader.upload("data/test.png");

    Mainloop.run("main");
}
