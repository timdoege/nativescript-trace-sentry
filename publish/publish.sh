#!/bin/bash

PACK_DIR=package;

publish() {
    cp npmjs.npmrc "${PACK_DIR}/.npmrc"
    cd $PACK_DIR
    echo 'Publishing to npm...'
    npm publish --"https://registry.npmjs.org/" *.tgz
}

./pack.sh && publish
#./pack.sh
