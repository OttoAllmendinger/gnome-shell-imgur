.PHONY: all

SCHEMA = org.gnome.shell.extensions.imgur.gschema.xml

SOURCE = src/*.js \
		 src/stylesheet.css \
		 src/metadata.json \
		 src/icons \
		 src/schemas/*

ZIPFILE = gnome-shell-imgur.zip

all: schemas archive

src/schemas/gschemas.compiled: src/schemas/$(SCHEMA)
	glib-compile-schemas src/schemas/

schemas: src/schemas/gschemas.compiled

archive: $(SOURCE)
	-rm $(ZIPFILE)
	cd src && zip -r ../$(ZIPFILE) $(patsubst src/%,%,$(SOURCE))
