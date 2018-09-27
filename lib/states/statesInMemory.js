/**
 *      States DB in memory - Client
 *
 *      Copyright 2013-2018 bluefox <dogafox@gmail.com>
 *
 *      MIT License
 *
 */

/** @module statesRedis */

/* jshint -W097 */
/* jshint strict: false */
/* jslint node: true */
'use strict';

const io = require('socket.io-client');

function StatesInMemory(settings) {

    var client;
    var subscribes = {};
    var connectionTimeout;

    this.states = {};

    var log = settings.logger;
    if (!log) {
        log = {
            silly: function (msg) {/*console.log(msg);*/},
            debug: function (msg) {/*console.log(msg);*/},
            info:  function (msg) {/*console.log(msg);*/},
            warn:  function (msg) {
                console.log(msg);
            },
            error: function (msg) {
                console.log(msg);
            }
        };
    } else if (!log.silly) {
        log.silly = log.debug;
    }

    /**
     * @method setState
     * @param id {String}           the id of the value. '<namespace>.' will be prepended
     * @param state {any}
     *
     *
     *      an object containing the actual value and some metadata:<br>
     *      setState(id, {'val': val, 'ts': ts, 'ack': ack, 'from': from, 'lc': lc})
     *
     *      if no object is given state is treated as val:<br>
     *      setState(id, val)
     *
     *      <ul><li><b>val</b>  the actual value. Can be any JSON-stringifiable object. If undefined the
     *                          value is kept unchanged.</li>
     *
     *      <li><b>ack</b>  a boolean that can be used to mark a value as confirmed, used in bidirectional systems which
     *                      acknowledge that a value has been successfully set. Will be set to false if undefined.</li>
     *
     *      <li><b>ts</b>   a unix timestamp indicating the last write-operation on the state. Will be set by the
     *                      setState method if undefined.</li>
     *
     *      <li><b>lc</b>   a unix timestamp indicating the last change of the actual value. this should be undefined
     *                      when calling setState, it will be set by the setValue method itself.</li></ul>
     *
     * @param callback {Function}   will be called when redis confirmed reception of the command
     *
     *
     */
    this.setState = function (id, state, callback) {
        this.states[id] = state;
    };

    // Used for restore function (do not call it
    this.setRawState = function (id, state, callback) {
        if (!client) return;
        client.emit('setRawState', id, state, callback);
    };

    /**
     * @method getState
     *
     * @param {String} id
     * @param callback
     */
    this.getState = function (id, callback) {

        if (this.states[id]) {
            var state = this.states[id];
            callback(state);
        }
    };

    this.getStates = function (keys, callback) {
        if (!client) return;
        client.emit('getStates', keys, function (err, res) {
            if (callback) callback(err, res);
        });
    };

    this.delState = function (id, callback) {
        if (!client) return;
        client.emit('delState', id, callback);
    };

    this.getKeys = function (pattern, callback, dontModify) {
        if (!client) return;
        client.emit('getKeys', pattern, callback);
    };
    
    /**
     * @method subscribe
     *
     * @param {string} pattern
     * @param {function} callback
     */
    this.subscribe = function (pattern, callback) {
        subscribes.subscribe = subscribes.subscribe || [];
        if (subscribes.subscribe.indexOf(pattern) === -1) subscribes.subscribe.push(pattern);
        if (!client) return;
        client.emit('subscribe', pattern, callback);
    };

    this.unsubscribe = function (pattern, callback) {
        if (subscribes.subscribe) {
            var pos = subscribes.subscribe.indexOf(pattern);
            if (pos !== -1) subscribes.subscribe.splice(pos, 1);
        }
        if (!client) return;
        client.emit('unsubscribe', pattern, callback);
    };

    this.pushMessage = function (id, state, callback) {
        if (!client) return;
        client.emit('pushMessage', id, state, callback);
    };

    this.lenMessage = function (id, callback) {
        if (!client) return;
        client.emit('lenMessage', id, callback);
    };

    this.getMessage = function (id, callback) {
        if (!client) return;
        client.emit('getMessage', id, callback);
    };

    this.delMessage = function (id, messageId, callback) {
        if (!client) return;
        client.emit('delMessage', id, messageId, callback);
    };

    this.subscribeMessage = function (pattern, callback) {
        subscribes.subscribeMessage = subscribes.subscribeMessage || [];
        if (subscribes.subscribeMessage.indexOf(pattern) === -1) subscribes.subscribeMessage.push(pattern);
        if (!client) return;
        client.emit('subscribeMessage', pattern, callback);
    };

    this.unsubscribeMessage = function (pattern, callback) {
        if (subscribes.subscribeMessage) {
            var pos = subscribes.subscribeMessage.indexOf(pattern);
            if (pos !== -1) subscribes.subscribeMessage.splice(pos, 1);
        }
        if (!client) return;
        client.emit('unsubscribeMessage', pattern, callback);
    };

    this.pushLog = function (id, state, callback) {
        if (!client) return;
        client.emit('pushLog', id, state, callback);
    };

    this.lenLog = function (id, callback) {
        if (!client) return;
        client.emit('lenLog', id, callback);
    };

    this.getLog = function (id, callback) {
        if (!client) return;
        client.emit('getLog', id, callback);
    };

    this.delLog = function (id, logId, callback) {
        if (!client) return;
        client.emit('delLog', id, logId, callback);
    };

    this.subscribeLog = function (pattern, callback) {
        subscribes.subscribeLog = subscribes.subscribeLog || [];
        if (subscribes.subscribeLog.indexOf(pattern) === -1) subscribes.subscribeLog.push(pattern);

        if (!client) return;
        client.emit('subscribeLog', pattern, callback);
    };

    this.unsubscribeLog = function (pattern, callback) {
        if (subscribes.subscribeLog) {
            var pos = subscribes.subscribeLog.indexOf(pattern);
            if (pos !== -1) subscribes.subscribeLog.splice(pos, 1);
        }
        if (!client) return;
        client.emit('unsubscribeLog', pattern, callback);
    };

    this.getSession = function (id, callback) {
        if (!client) return;
        client.emit('getSession', id, callback);
    };

    this.setSession = function (id, expire, obj, callback) {
        if (!client) return;
        client.emit('setSession', id, expire, obj, callback);
    };

    this.destroySession = function (id, callback) {
        if (!client) return;
        client.emit('destroySession', id, callback);
    };

    this.getConfig = function (id, callback) {
        if (!client) return;
        client.emit('getConfig', id, callback);
    };

    this.getConfigKeys = function (pattern, callback, dontModify) {
        if (!client) return;
        client.emit('getConfigKeys', pattern, callback);
    };

    this.getConfigs = function (keys, callback, dontModify) {
        if (!client) return;
        client.emit('getConfigs', keys, callback);
    };
    
    this.setConfig = function (id, obj, callback) {
        if (!client) return;
        client.emit('setConfig', id, obj, callback);
    };

    this.delConfig = function (id, callback) {
        if (!client) return;
        client.emit('delConfig', id, callback);
    };

    this.subscribeConfig = function (pattern, callback) {
        subscribes.subscribeConfig = subscribes.subscribeConfig || [];
        if (subscribes.subscribeConfig.indexOf(pattern) === -1) subscribes.subscribeConfig.push(pattern);
        if (!client) return;
        client.emit('subscribeConfig', pattern, callback);
    };

    this.unsubscribeConfig = function (pattern, callback) {
        if (subscribes.subscribeConfig) {
            var pos = subscribes.subscribeConfig.indexOf(pattern);
            if (pos !== -1) subscribes.subscribeConfig.splice(pos, 1);
        }
        if (!client) return;
        client.emit('unsubscribeConfig', pattern, callback);
    };

    this.setBinaryState = function (id, data, callback) {
        if (!client) return;
        client.emit('setBinaryState', id, data, callback);
    };

    this.getBinaryState = function (id, callback) {
        if (!client) return;
        client.emit('getBinaryState', id, callback);
    };

    this.delBinaryState = function (id, callback) {
        if (!client) return;
        client.emit('delBinaryState', id, callback);
    };
}

module.exports = StatesInMemory;
