var namespace = 'javascript.0';

var config = {log: {}};
config.states = {type: 'file'};
config.objects = {type: 'file'};
config.log.level = 'info';
config.subscribe = false;

var Objects = require(__dirname + '/objects/objectsInMemory');
var States = require(__dirname + '/states/statesInMemory');

function patternMatching(event, patternFunctions) {
    var matched = false;
    for (var i = 0, len = patternFunctions.length; i < len; i++) {
        if (patternFunctions[i](event)) {
            if (patternFunctions.logic === 'or') return true;

            matched = true;
        } else {
            if (patternFunctions.logic === 'and') return false;
        }
    }
    return matched;
}

function EventObj(id, state, oldState) {
    if (!(this instanceof EventObj)) return new EventObj(id, newState, oldState);
    this.id = id;
    this.newState = {
        val: state.val,
        ts: state.ts,
        ack: state.ack,
        lc: state.lc,
        from: state.from
    };
    //if (oldState === undefined) oldState = {};
    if (!oldState) {
        this.oldState = {
            val: undefined,
            ts: undefined,
            ack: undefined,
            lc: undefined,
            from: undefined
        };
    } else {
        this.oldState = {
            val: oldState.val,
            ts: oldState.ts,
            ack: oldState.ack,
            lc: oldState.lc,
            from: oldState.from
        };
    }
    this.state = this.newState;
}

function Adapter() {

    var stateIds = [];
    this.subscriptions = [];
    var subscriptions = this.subscriptions;

    this.objects = new Objects({logger: false});
    this.states = new States({logger: false});

    var defaultObjs = false;
    this._namespaceRegExp = new RegExp('^' + namespace)      // chache the regex object 'adapter.0'

    this.config = config;

    this.log = {
        info: function (message) {
            console.log('info: ' + message)
        },
        error: function (message) {
            console.log('error: ' + message)
        },
        debug: function (message) {
            console.log('debug: ' + message)
        },
    };

    this.setObject = function (id, obj, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }
        if (!this.defaultObjs) {
            this.defaultObjs = require(__dirname + '/defaultObjs.js')('de', '°C', 'EUR');
        }

        if (!id) {
            logger.error(that.namespace + ' setObject id missing!!');
            if (typeof callback === 'function') callback('id missing!');
            return;
        }

        if (!obj) {
            logger.error(that.namespace + ' setObject ' + id + ' object missing!');
            if (typeof callback === 'function') callback('object missing!');
            return;
        }

        if (obj.hasOwnProperty('type')) {
            if (!obj.hasOwnProperty('native')) {
                logger.warn(that.namespace + ' setObject ' + id + ' (type=' + obj.type + ') property native missing!');
                obj.native = {};
            }
            // Check property 'common'
            if (!obj.hasOwnProperty('common')) {
                logger.warn(that.namespace + ' setObject ' + id + ' (type=' + obj.type + ') property common missing!');
                obj.common = {};
            } else if (obj.type === 'state') {
                // Try to extend the model for type='state'
                // Check property 'role' by 'state'
                if (obj.common.hasOwnProperty('role') && this.defaultObjs[obj.common.role]) {
                    obj.common = extend(true, this.defaultObjs[obj.common.role], obj.common);
                } else if (!obj.common.hasOwnProperty('role')) {
                    logger.warn(that.namespace + ' setObject ' + id + ' (type=' + obj.type + ') property common.role missing!');
                }
                if (!obj.common.hasOwnProperty('type')) {
                    logger.warn(that.namespace + ' setObject ' + id + ' (type=' + obj.type + ') property common.type missing!');
                }
            }

            if (!obj.common.hasOwnProperty('name')) {
                obj.common.name = id;
                logger.debug(this.namespace + ' setObject ' + id + ' (type=' + obj.type + ') property common.name missing, using id as name');
            }

            id = this._fixId(id, false, obj.type);

            if (obj.children || obj.parent) {
                logger.warn(this.namespace + ' Do not use parent or children for ' + id);
            }
            if (!obj.from) obj.from = 'system.adapter.' + namespace;
            if (!obj.ts) obj.ts = new Date().getTime();

            this.objects.setObject(id, obj, options, callback);

        } else {
            logger.error(that.namespace + ' setObject ' + id + ' mandatory property type missing!');
            if (typeof callback === 'function') callback('mandatory property type missing!');
        }
    };

    this.setForeignState = function setForeignState(id, state, ack, options, callback) {
        if (typeof state === 'object' && typeof ack !== 'boolean') {
            callback = options;
            options = ack;
            ack = undefined;
        }

        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        if (typeof ack === 'function') {
            callback = ack;
            ack = undefined;
        }

        if (typeof state !== 'object' || state === null || state === undefined) state = {val: state};

        if (ack !== undefined) {
            state.ack = ack;
        }

        state.from = 'system.adapter.' + this.namespace;

        if (options && options.user && options.user !== 'system.user.admin') {
            checkStates(id, options, 'setState', function (err) {
                if (err) {
                    if (typeof callback === 'function') callback(err);
                } else {
                    this.outputCount++;
                    this.states.setState(id, state, callback);
                }
            });
        } else {
            this.outputCount++;
            this.states.setState(id, state, callback);
        }
    };

    function objectChange(id, obj) {
        if (this.regExEnum.test(id)) {
            // clear cache
            cacheObjectEnums = {};
        }

        if (!obj) {
            // object deleted
            if (!objects[id]) return;

            // Script deleted => remove it
            if (objects[id].type === 'script' && objects[id].common.engine === 'system.adapter.' + adapter.namespace) {
                stop(id);

                var idActive = 'scriptEnabled.' + id.substring('script.js.'.length);
                adapter.delObject(idActive);
                adapter.delState(idActive);
            }

            removeFromNames(id);
            delete objects[id];
        } else if (!objects[id]) {
            // New object
            objects[id] = obj;

            addToNames(obj);

            if (obj.type === 'script' && obj.common.engine === 'system.adapter.' + adapter.namespace) {
                // create states for scripts
                createActiveObject(id, obj.common.enabled);

                if (obj.common.enabled) {
                    if (adapter.checkIsGlobal(obj)) {
                        // restart adapter
                        adapter.getForeignObject('system.adapter.' + adapter.namespace, function (err, _obj) {
                            if (_obj) adapter.setForeignObject('system.adapter.' + adapter.namespace, _obj);
                        });
                        return;
                    }

                    // Start script
                    load(id);
                }
            }
            // added new script to this engine
        } else if (objects[id].common) {
            var n = getName(id);

            if (n !== objects[id].common.name) {
                if (n) removeFromNames(id);
                if (objects[id].common.name) addToNames(obj);
            }

            // Object just changed
            if (obj.type !== 'script') {
                objects[id] = obj;

                if (id === 'system.config') {
                    // set langugae for debug messages
                    if (objects['system.config'].common.language) words.setLanguage(objects['system.config'].common.language);
                }

                return;
            }

            if (adapter.checkIsGlobal(objects[id])) {
                // restart adapter
                adapter.getForeignObject('system.adapter.' + adapter.namespace, function (err, obj) {
                    if (obj) {
                        adapter.setForeignObject('system.adapter.' + adapter.namespace, obj);
                    }
                });
                return;
            }

            if ((objects[id].common.enabled && !obj.common.enabled) ||
                (objects[id].common.engine === 'system.adapter.' + adapter.namespace && obj.common.engine !== 'system.adapter.' + adapter.namespace)) {

                // Script disabled
                if (objects[id].common.enabled && objects[id].common.engine === 'system.adapter.' + adapter.namespace) {
                    // Remove it from executing
                    objects[id] = obj;
                    stop(id);
                } else {
                    objects[id] = obj;
                }
            } else if ((!objects[id].common.enabled && obj.common.enabled) ||
                (objects[id].common.engine !== 'system.adapter.' + adapter.namespace && obj.common.engine === 'system.adapter.' + adapter.namespace)) {
                // Script enabled
                objects[id] = obj;

                if (objects[id].common.enabled && objects[id].common.engine === 'system.adapter.' + adapter.namespace) {
                    // Start script
                    load(id);
                }
            } else { //if (obj.common.source !== objects[id].common.source) {
                objects[id] = obj;

                // Source changed => restart it
                stop(id, function (res, _id) {
                    load(_id);
                });
            }
            /*else {
                               // Something changed or not for us
                               objects[id] = obj;
                           }*/
        }
    };

    this.stateChange = function (id, state) {
        if (id.startsWith('messagebox.') || id.startsWith('log.')) return;

        var oldState = this.states.states[id];
        if (state) {
            if (oldState) {
                // enable or disable script
                if (!state.ack && id.startsWith(activeStr)) {
                    adapter.extendForeignObject(objects[id].native.script, {common: {enabled: state.val}});
                }

                // monitor if adapter is alive and send all subscriptions once more, after adapter goes online
                if (/*oldState && */oldState.val === false && state.val && id.endsWith('.alive')) {
                    if (adapterSubs[id]) {
                        var parts = id.split('.');
                        var a = parts[2] + '.' + parts[3];
                        for (var t = 0; t < adapterSubs[id].length; t++) {
                            adapter.log.info('Detected coming adapter "' + a + '". Send subscribe: ' + adapterSubs[id][t]);
                            adapter.sendTo(a, 'subscribe', adapterSubs[id][t]);
                        }
                    }
                }
            } else {
                if (/*!oldState && */stateIds.indexOf(id) === -1) {
                    stateIds.push(id);
                    stateIds.sort();
                }
            }
            this.states[id] = state;
        } else {
            if (oldState) delete states[id];
            state = {};
            var pos = stateIds.indexOf(id);
            if (pos !== -1) {
                stateIds.splice(pos, 1);
            }
        }

        var eventObj = new EventObj(id, state, oldState);

        // if this state matchs any subscriptions
        for (var i = 0, l = subscriptions.length; i < l; i++) {
            var sub = subscriptions[i];
            if (sub && patternMatching(eventObj, sub.patternCompareFunctions)) {
                sub.callback(eventObj);
            }
        }
    };

    this.getObject = function (id, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }
        this.objects.getObject(this._fixId(id), options, callback);
    };

    this.getState = function getState(id, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }

        id = this._fixId(id, false, 'state');

        if (this.oStates && this.oStates[id]) {
            if (typeof callback === 'function') callback(null, this.oStates[id]);
        } else {
            this.states.getState(id, callback);
        }
    };

    function autoSubscribeOn(cb) {
        if (!this.autoSubscribe) {
            // collect all
            this.objects.getObjectView('system', 'instance', {
                startkey: 'system.adapter.',
                endkey: 'system.adapter.\u9999'
            }, options, function (err, res) {
                if (res && res.rows) {
                    that.autoSubscribe = [];
                    for (var c = res.rows.length - 1; c >= 0; c--) {

                        if (res.rows[c].value.common.subscribable) {
                            var _id = res.rows[c].id.substring(15);
                            if (that.autoSubscribe.indexOf(_id) === -1) that.autoSubscribe.push(_id);
                        }
                    }
                }

                if (typeof cb === 'function') cb();
            });
            // because of autoSubscribe
            this.objects.subscribe('system.adapter.*');
        } else if (typeof cb === 'function') {
            cb();
        }
    }

    function subscribeForeignStates(pattern, options, callback) {
        if (!pattern) pattern = '*';
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }

        // Todo check rights for options

        this.autoSubscribeOn(function () {
            // compare if this pattern for one of autosubscribe adapters
            for (var s = 0; s < this.autoSubscribe.length; s++) {
                if (pattern === '*' || pattern.substring(0, that.autoSubscribe[s].length + 1) === that.autoSubscribe[s] + '.') {
                    // put this pattern into adapter list
                    that.states.getState('system.adapter.' + that.autoSubscribe[s] + '.subscribes', function (err, state) {
                        state = {};
                        state.val = state.val || '{}';
                        var subs;
                        try {
                            subs = JSON.parse(state.val);
                        } catch (e) {
                            that.log.error('Cannot parse subscribes for "' + that.autoSubscribe[s] + '.subscribes"');
                        }
                        subs[pattern] = subs[pattern] || {};
                        subs[pattern][that.namespace] = subs[pattern][that.namespace] || 0;
                        subs[pattern][that.namespace]++;
                        that.outputCount++;
                        that.states.setState('system.adapter.' + that.autoSubscribe[s] + '.subscribes', subs);
                    });
                }
            }

            that.states.subscribe(pattern, callback);
        });
    };

    function getForeignState(id, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = {};
        }
        if (options && options.user && options.user !== 'system.user.admin') {
            checkStates(id, options, 'getState', function (err) {
                if (err) {
                    if (typeof callback === 'function') callback(err);
                } else {
                    if (that.oStates && that.oStates[id]) {
                        if (typeof callback === 'function') callback(null, that.oStates[id]);
                    } else {
                        that.states.getState(id, callback);
                    }
                }
            });
        } else {
            if (this.oStates && this.oStates[id]) {
                if (typeof callback === 'function') callback(null, that.oStates[id]);
            } else {
                this.states.getState(id, callback);
            }
        }
    };


    this._fixId = function (id, isPattern/* , type */) {

        var result = '';
        // If id is an object
        if (typeof id === 'object') {
            // Add namespace + device + channel
            result = namespace + '.' + (id.device ? id.device + '.' : '') + (id.channel ? id.channel + '.' : '') + (id.state ? id.state : '');
        } else {
            result = id;
            if (!this._namespaceRegExp.test(id)) {
                if (!isPattern) {
                    result = namespace + (id ? '.' + id : '');
                } else {
                    result = namespace + '.' + (id ? id : '');
                }
            }
        }
        return result;
    }
}

module.exports = Adapter;