var script = {_id: 'id'};
var name = 'name';
var verbose = true;
var adapter = {
    namespace: 'adapter.namespace',
    log: {
        info: function(){}
    }
};
var objects = [];

var subscriptions = [];

var patternCompareFunctions = require(__dirname + '/lib/patternCompareFunctions');

var sandbox = {
        //mods:      mods,
        _id: script._id,
        name: name,
        //instance:  adapter.instance,
        verbose: verbose,
        /*request:   mods.request,
        require:   function (md) {
            if (mods[md]) return mods[md];
            try {
                mods[md] = require(__dirname + '/node_modules/' + md);
                return mods[md];
            } catch (e) {
                logError(name, e, 6);
            }
        },*/
        Buffer: Buffer,
        __engine: {
            __subscriptions: 0,
            __schedules: 0
        },
        $: function (selector) {
            // following is supported
            // 'type[commonAttr=something]', 'id[commonAttr=something]', id(enumName="something")', id{nativeName="something"}
            // Type can be state, channel or device
            // Attr can be any of the common attributes and can have wildcards *
            // E.g. "state[id='hm-rpc.0.*]" or "hm-rpc.0.*" returns all states of adapter instance hm-rpc.0
            // channel(room="Living room") => all states in room "Living room"
            // channel{TYPE=BLIND}[state.id=*.LEVEL]
            // Switch all states with .STATE of channels with role "switch" in "Wohnzimmer" to false
            // $('channel[role=switch][state.id=*.STATE](rooms=Wohnzimmer)').setState(false);
            //
            // Following functions are possible, setValue, getValue (only from first), on, each

            // Todo CACHE!!!

            var result = {};

            var name = '';
            var commons = [];
            var _enums = [];
            var natives = [];
            var isName = true;
            var isCommons = false;
            var isEnums = false;
            var isNatives = false;
            var common = '';
            var native = '';
            var _enum = '';
            var parts;
            var len;

            // parse string
            for (var i = 0; i < selector.length; i++) {
                if (selector[i] === '{') {
                    isName = false;
                    if (isCommons || isEnums || isNatives) {
                        // Error
                        return [];
                    }
                    isNatives = true;
                } else if (selector[i] === '}') {
                    isNatives = false;
                    natives.push(native);
                    native = '';
                } else if (selector[i] === '[') {
                    isName = false;
                    if (isCommons || isEnums || isNatives) {
                        // Error
                        return [];
                    }
                    isCommons = true;
                } else if (selector[i] === ']') {
                    isCommons = false;
                    commons.push(common);
                    common = '';
                } else if (selector[i] === '(') {
                    isName = false;
                    if (isCommons || isEnums || isNatives) {
                        // Error
                        return [];
                    }
                    isEnums = true;
                } else if (selector[i] === ')') {
                    isEnums = false;
                    _enums.push(_enum);
                    _enum = '';
                } else if (isName) {
                    name += selector[i];
                } else if (isCommons) {
                    common += selector[i];
                } else if (isEnums) {
                    _enum += selector[i];
                } else if (isNatives) {
                    native += selector[i];
                } //else {
                // some error
                //}
            }

            // If some error in the selector
            if (isEnums || isCommons || isNatives) {
                result.length = 0;
                result.each = function () {
                    return this;
                };
                result.getState = function () {
                    return null;
                };
                result.setState = function () {
                    return this;
                };
                result.on = function () {
                };
            }

            if (isEnums) {
                adapter.log.warn('Invalid selector: enum close bracket cannot be found in "' + selector + '"');
                result.error = 'Invalid selector: enum close bracket cannot be found';
                return result;
            } else if (isCommons) {
                adapter.log.warn('Invalid selector: common close bracket cannot be found in "' + selector + '"');
                result.error = 'Invalid selector: common close bracket cannot be found';
                return result;
            } else if (isNatives) {
                adapter.log.warn('Invalid selector: native close bracket cannot be found in "' + selector + '"');
                result.error = 'Invalid selector: native close bracket cannot be found';
                return result;
            }

            var filterStates = [];

            for (i = 0; i < commons.length; i++) {
                parts = commons[i].split('=', 2);
                if (parts[1] && parts[1][0] === '"') {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === '"') parts[1] = parts[1].substring(0, len - 1);
                }
                if (parts[1] && parts[1][0] === "'") {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === "'") parts[1] = parts[1].substring(0, len - 1);
                }

                if (parts[1]) parts[1] = parts[1].trim();
                parts[0] = parts[0].trim();

                if (parts[0] === 'state.id') {
                    filterStates.push({attr: parts[0], value: parts[1].trim()});
                    commons[i] = null;
                } else {
                    commons[i] = {attr: parts[0], value: parts[1].trim()};
                }
            }

            for (i = 0; i < natives.length; i++) {
                parts = natives[i].split('=', 2);
                if (parts[1] && parts[1][0] === '"') {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === '"') parts[1] = parts[1].substring(0, len - 1);
                }
                if (parts[1] && parts[1][0] === "'") {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === "'") parts[1] = parts[1].substring(0, len - 1);
                }

                if (parts[1]) parts[1] = parts[1].trim();
                parts[0] = parts[0].trim();
                if (parts[0] === 'state.id') {
                    filterStates.push({attr: parts[0], value: parts[1].trim()});
                    natives[i] = null;
                } else {
                    natives[i] = {attr: parts[0].trim(), value: parts[1].trim()};
                }
            }

            for (i = 0; i < _enums.length; i++) {
                parts = _enums[i].split('=', 2);
                if (parts[1] && parts[1][0] === '"') {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === '"') parts[1] = parts[1].substring(0, len - 1);
                }
                if (parts[1] && parts[1][0] === "'") {
                    parts[1] = parts[1].substring(1);
                    len = parts[1].length;
                    if (parts[1] && parts[1][len - 1] === "'") parts[1] = parts[1].substring(0, len - 1);
                }

                if (parts[1]) parts[1] = parts[1].trim();
                parts[0] = parts[0].trim();
                if (parts[0] === 'state.id') {
                    filterStates.push({attr: parts[0], value: parts[1].trim()});
                    _enums[i] = null;
                } else {
                    _enums[i] = 'enum.' + parts[0].trim() + '.' + parts[1].trim();
                }
            }

            name = name.trim();
            if (name === 'channel' || name === 'device') {
                // Fill channels
                if (!channels || !devices) {
                    channels = {};
                    devices = {};
                    for (var _id in objects) {
                        if (objects[_id].type === 'state') {
                            parts = _id.split('.');
                            parts.pop();
                            var chn = parts.join('.');

                            parts.pop();
                            var dev = parts.join('.');

                            devices[dev] = devices[dev] || [];
                            devices[dev].push(_id);

                            channels[chn] = channels[chn] || [];
                            channels[chn].push(_id);
                        }
                    }
                }
            }

            var res = [];
            var id;
            var s;
            var pass;
            if (name === 'channel') {
                for (id in channels) {
                    if (!channels.hasOwnProperty(id) || !objects.hasOwnProperty(id)) continue;
                    pass = true;
                    for (var c = 0; c < commons.length; c++) {
                        if (!commons[c]) continue;
                        if (commons[c].attr === 'id') {
                            if (!commons[c].r && commons[c].value) commons[c].r = new RegExp('^' + commons[c].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                            if (!commons[c].r || commons[c].r.test(id)) continue;
                        } else if (objects[id].common) {
                            if (commons[c].value === undefined && objects[id].common[commons[c].attr] !== undefined) continue;
                            if (objects[id].common[commons[c].attr] === commons[c].value) continue;
                        }
                        pass = false;
                        break;
                    }
                    if (!pass) continue;
                    for (var n = 0; n < natives.length; n++) {
                        if (!natives[n]) continue;
                        if (natives[n].attr === 'id') {
                            if (!natives[n].r && natives[n].value) natives[n].r = new RegExp('^' + natives[n].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                            if (!natives[n].r || natives[n].r.test(id)) continue;
                        } else if (objects[id].native) {
                            if (natives[n].value === undefined && objects[id].native[natives[n].attr] !== undefined) continue;
                            if (objects[id].native[natives[n].attr] == natives[n].value) continue;
                        }
                        pass = false;
                        break;
                    }
                    if (!pass) continue;

                    if (_enums.length) {
                        var enumIds = [];
                        getObjectEnumsSync(id, enumIds);

                        for (var m = 0; m < _enums.length; m++) {
                            if (!_enums[m]) continue;
                            if (enumIds.indexOf(_enums[m]) !== -1) continue;
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }

                    // Add all states of this channel to list
                    for (s = 0; s < channels[id].length; s++) {
                        if (filterStates.length) {
                            pass = true;
                            for (var st = 0; st < filterStates.length; st++) {
                                if (!filterStates[st].r && filterStates[st].value) {
                                    if (filterStates[st].value[0] === '*') {
                                        filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                                    } else if (filterStates[st].value[filterStates[st].value - 1] === '*') {
                                        filterStates[st].r = new RegExp('^' + filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                    } else {
                                        filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                    }
                                }
                                if (!filterStates[st].r || filterStates[st].r.test(channels[id][s])) continue;
                                pass = false;
                                break;
                            }
                            if (!pass) continue;
                        }
                        res.push(channels[id][s]);
                    }
                }
            } else if (name === 'device') {
                for (id in devices) {
                    if (!objects[id]) {
                        console.log(id);
                        continue;
                    }
                    pass = true;
                    for (var _c = 0; _c < commons.length; _c++) {
                        if (!commons[_c]) continue;
                        if (commons[_c].attr === 'id') {
                            if (!commons[_c].r && commons[_c].value) commons[_c].r = new RegExp('^' + commons[_c].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                            if (!commons[_c].r || commons[_c].r.test(id)) continue;
                        } else if (objects[id].common) {
                            if (commons[_c].value === undefined && objects[id].common[commons[_c].attr] !== undefined) continue;
                            if (objects[id].common[commons[_c].attr] == commons[_c].value) continue;
                        }
                        pass = false;
                        break;
                    }
                    if (!pass) continue;
                    for (var n = 0; n < natives.length; n++) {
                        if (!natives[n]) continue;
                        if (natives[n].attr === 'id') {
                            if (!natives[n].r && natives[n].value) natives[n].r = new RegExp('^' + natives[n].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                            if (!natives[n].r || natives[n].r.test(id)) continue;
                        } else if (objects[id].native) {
                            if (natives[n].value === undefined && objects[id].native[natives[n].attr] !== undefined) continue;
                            if (objects[i].native[natives[n].attr] == natives[n].value) continue;
                        }
                        pass = false;
                        break;
                    }
                    if (!pass) continue;

                    if (_enums.length) {
                        var enumIds = [];
                        getObjectEnumsSync(id, enumIds);

                        for (var n = 0; n < _enums.length; n++) {
                            if (!_enums[n]) continue;
                            if (enumIds.indexOf(_enums[n]) !== -1) continue;
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }

                    // Add all states of this channel to list
                    for (s = 0; s < devices[id].length; s++) {
                        if (filterStates.length) {
                            pass = true;
                            for (var st = 0; st < filterStates.length; st++) {
                                if (!filterStates[st].r && filterStates[st].value) {
                                    if (filterStates[st].value[0] === '*') {
                                        filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                                    } else if (filterStates[st].value[filterStates[st].value - 1] === '*') {
                                        filterStates[st].r = new RegExp('^' + filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                    } else {
                                        filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                    }
                                }
                                if (!filterStates[st].r || filterStates[st].r.test(devices[id][s])) continue;
                                pass = false;
                                break;
                            }
                            if (!pass) continue;
                        }
                        res.push(devices[id][s]);
                    }
                }
            } else {
                var r = (name && name !== 'state') ? new RegExp('^' + name.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$') : null;

                // state
                for (var s = 0; s < stateIds.length; s++) {
                    id = stateIds[s];
                    if (r && !r.test(id)) continue;
                    pass = true;

                    if (commons.length) {
                        for (var c = 0; c < commons.length; c++) {
                            if (!commons[c]) continue;
                            if (commons[c].attr === 'id') {
                                if (!commons[c].r && commons[c].value) commons[c].r = new RegExp(commons[c].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                if (!commons[c].r || commons[c].r.test(id)) continue;
                            } else if (objects[id].common) {
                                if (commons[c].value === undefined && objects[id].common[commons[c].attr] !== undefined) continue;
                                if (objects[id].common[commons[c].attr] == commons[c].value) continue;
                            }
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }
                    if (natives.length) {
                        for (var n = 0; n < natives.length; n++) {
                            if (!natives[n]) continue;
                            if (natives[n].attr === 'id') {
                                if (!natives[n].r && natives[n].value) natives[id].r = new RegExp(natives[n].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                if (!natives[n].r || natives[n].r.test(id)) continue;
                            } else if (objects[id].native) {
                                if (natives[n].value === undefined && objects[id].native[natives[n].attr] !== undefined) continue;
                                if (objects[id].native[natives[n].attr] == natives[n].value) continue;
                            }
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }

                    if (filterStates.length) {
                        for (var st = 0; st < filterStates.length; st++) {
                            if (!filterStates[st].r && filterStates[st].value) {
                                if (filterStates[st].value[0] === '*') {
                                    filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
                                } else if (filterStates[st].value[filterStates[st].value - 1] === '*') {
                                    filterStates[st].r = new RegExp('^' + filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                } else {
                                    filterStates[st].r = new RegExp(filterStates[st].value.replace(/\./g, '\\.').replace(/\*/g, '.*'));
                                }
                            }
                            if (!filterStates[st].r || filterStates[st].r.test(id)) continue;
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }

                    if (_enums.length) {
                        var enumIds = [];
                        getObjectEnumsSync(id, enumIds);

                        for (var nn = 0; nn < _enums.length; nn++) {
                            if (!_enums[nn]) continue;
                            if (enumIds.indexOf(_enums[nn]) !== -1) continue;
                            pass = false;
                            break;
                        }
                        if (!pass) continue;
                    }
                    // Add all states of this channel to list
                    res.push(id);
                }

                // Now filter away by name
            }

            for (i = 0; i < res.length; i++) {
                result[i] = res[i];
            }
            result.length = res.length;
            result.each = function (callback) {
                if (typeof callback === 'function') {
                    var r;
                    for (var i = 0; i < this.length; i++) {
                        r = callback(result[i], i);
                        if (r === false) break;
                    }
                }
                return this;
            };
            result.getState = function (callback) {
                if (adapter.config.subscribe) {
                    if (typeof callback !== 'function') {
                        sandbox.log('You cannot use this function synchronous', 'error');
                    } else {
                        adapter.getForeignState(this[0], callback);
                    }
                } else {
                    if (this[0]) return states[this[0]];
                    return null;
                }
            };
            result.setState = function (state, isAck, callback) {
                if (typeof isAck === 'function') {
                    callback = isAck;
                    isAck = undefined;
                }

                if (isAck === true || isAck === false || isAck === 'true' || isAck === 'false') {
                    if (typeof state === 'object') {
                        state.ack = isAck;
                    } else {
                        state = {val: state, ack: isAck};
                    }
                }
                var cnt = 0;
                for (var i = 0; i < this.length; i++) {
                    cnt++;
                    adapter.setForeignState(this[i], state, function () {
                        if (!--cnt && typeof callback === 'function') callback();
                    });
                }
                return this;
            };
            result.on = function (callbackOrId, value) {
                for (var i = 0; i < this.length; i++) {
                    sandbox.subscribe(this[i], callbackOrId, value);
                }
                return this;
            };
            return result;
        },
        log: function (msg, sev) {
            if (!sev) sev = 'info';
            if (!adapter.log[sev]) {
                msg = 'Unknown severity level "' + sev + '" by log of [' + msg + ']';
                sev = 'warn';
            }
            adapter.log[sev](name + ': ' + msg);
        },
        exec: function (cmd, callback) {
            if (!adapter.config.enableExec) {
                var error = 'exec is not available. Please enable "Enable Exec" option in instance settings';
                adapter.log.error(error);
                sandbox.log(error);
                if (typeof callback === 'function') {
                    setImmediate(function () {
                        callback(error);
                    });
                }
            } else {
                if (sandbox.verbose) {
                    sandbox.log('exec: ' + cmd, 'info');
                }
                if (debug) {
                    sandbox.log(words._('Command %s was not executed, while debug mode is active', cmd), 'warn');
                    if (typeof callback === 'function') {
                        setImmediate(function () {
                            callback();
                        });
                    }
                } else {
                    return mods.child_process.exec(cmd, callback);
                }
            }
        },
        email: function (msg) {
            if (sandbox.verbose) sandbox.log('email(msg=' + JSON.stringify(msg) + ')', 'info');
            adapter.sendTo('email', msg);
        },
        pushover: function (msg) {
            if (sandbox.verbose) sandbox.log('pushover(msg=' + JSON.stringify(msg) + ')', 'info');
            adapter.sendTo('pushover', msg);
        },
        subscribe: function (pattern, callbackOrId, value) {
            if (pattern && Array.isArray(pattern)) {
                var result = [];
                for (var t = 0; t < pattern.length; t++) {
                    result.push(sandbox.subscribe(pattern[t], callbackOrId, value));
                }
                return result;
            }
            if (pattern && pattern.id && Array.isArray(pattern.id)) {
                var result_ = [];
                for (var tt = 0; tt < pattern.id.length; tt++) {
                    var pa = JSON.parse(JSON.stringify(pattern));
                    pa.id = pattern.id[tt];
                    result_.push(sandbox.subscribe(pa, callbackOrId, value));
                }
                return result_;
            }

            if (typeof pattern === 'object') {
                if (pattern.astro) {
                    return sandbox.schedule(pattern, callbackOrId, value);
                } else if (pattern.time) {
                    return sandbox.schedule(pattern.time, callbackOrId, value);
                }
            }

            var callback;

            sandbox.__engine.__subscriptions += 1;

            // source is set by regexp if defined as /regexp/
            if (typeof pattern !== 'object' || pattern instanceof RegExp || pattern.source) {
                pattern = {id: pattern, change: 'ne'};
            }

            if (pattern.id !== undefined && !pattern.id) {
                adapter.log.error('Error by subscription: empty ID defined. All states matched.');
                return;
            }

            // add adapter namespace if nothing given
            if (pattern.id && typeof pattern.id === 'string' && pattern.id.indexOf('.') === -1) {
                pattern.id = adapter.namespace + '.' + pattern.id;
            }

            if (typeof callbackOrId === 'function') {
                callback = callbackOrId;
            } else {
                var that = this;
                if (typeof value === 'undefined') {
                    callback = function (obj) {
                        that.setState(callbackOrId, obj.newState.val);
                    };
                } else {
                    callback = function (/* obj */) {
                        that.setState(callbackOrId, value);
                    };
                }
            }

            var subs = {
                pattern: pattern,
                callback: function (obj) {
                    if (typeof callback === 'function') {
                        try {
                            callback.call(sandbox, obj);
                        } catch (e) {
                            errorInCallback(e); // adapter.log.error('Error in callback: ' + e);
                        }
                    }
                },
                name: name
            };

            // try to extract adapter
            if (pattern.id && typeof pattern.id === 'string') {
                var parts = pattern.id.split('.');
                var a = parts[0] + '.' + parts[1];
                var _adapter = 'system.adapter.' + a;

                if (objects[_adapter] && objects[_adapter].common && objects[_adapter].common.subscribable) {
                    var alive = 'system.adapter.' + a + '.alive';
                    adapterSubs[alive] = adapterSubs[alive] || [];

                    var subExists = adapterSubs[alive].filter(function (sub) {
                        return sub === pattern.id;
                    }).length > 0;

                    if (!subExists) {
                        adapterSubs[alive].push(pattern.id);
                        adapter.sendTo(a, 'subscribe', pattern.id);
                    }
                }
            }
            if (sandbox.verbose) sandbox.log('subscribe: ' + JSON.stringify(subs), 'info');

            //subscribePattern(script, pattern.id);

            subs.patternCompareFunctions = getPatternCompareFunctions(pattern);
            subscriptions.push(subs);

            if (pattern.enumName || pattern.enumId) isEnums = true;
            return subs;
        },
        getSubscriptions: function () {
            var result = {};
            for (var s = 0; s < subscriptions.length; s++) {
                result[subscriptions[s].pattern.id] = result[subscriptions[s].pattern.id] || [];
                result[subscriptions[s].pattern.id].push({
                    name: subscriptions[s].name,
                    pattern: subscriptions[s].pattern
                });
            }
            if (sandbox.verbose) sandbox.log('getSubscriptions() => ' + JSON.stringify(result), 'info');
            return result;
        },
        adapterSubscribe: function (id) {
            if (typeof id !== 'string') {
                adapter.log.error('adapterSubscribe: invalid type of id' + typeof id);
                return;
            }
            var parts = id.split('.');
            var _adapter = 'system.adapter.' + parts[0] + '.' + parts[1];
            if (objects[_adapter] && objects[_adapter].common && objects[_adapter].common.subscribable) {
                var a = parts[0] + '.' + parts[1];
                var alive = 'system.adapter.' + a + '.alive';
                adapterSubs[alive] = adapterSubs[alive] || [];
                adapterSubs[alive].push(id);
                if (sandbox.verbose) sandbox.log('adapterSubscribe: ' + a + ' - ' + id, 'info');
                adapter.sendTo(a, 'subscribe', id);
            }
        },
        adapterUnsubscribe: function (id) {
            unsubscribe(id);
        },
        unsubscribe: function (idOrObject) {
            if (idOrObject && Array.isArray(idOrObject)) {
                var result = [];
                for (var t = 0; t < idOrObject.length; t++) {
                    result.push(sandbox.unsubscribe(idOrObject[t]));
                }
                return result;
            }
            var i;
            if (sandbox.verbose) sandbox.log('adapterUnsubscribe(id=' + idOrObject + ')', 'info');
            if (typeof idOrObject === 'object') {
                for (i = subscriptions.length - 1; i >= 0; i--) {
                    if (subscriptions[i] === idOrObject) {
                        unsubscribePattern(subscriptions[i].pattern.id);
                        subscriptions.splice(i, 1);
                        sandbox.__engine.__subscriptions--;
                        return true;
                    }
                }
            } else {
                var deleted = 0;
                for (i = subscriptions.length - 1; i >= 0; i--) {
                    if (subscriptions[i].name === name && subscriptions[i].pattern.id === idOrObject) {
                        deleted++;
                        unsubscribePattern(subscriptions[i].pattern.id);
                        subscriptions.splice(i, 1);
                        sandbox.__engine.__subscriptions--;
                    }
                }
                return !!deleted;
            }
        },
        on: function (pattern, callbackOrId, value) {
            return sandbox.subscribe(pattern, callbackOrId, value);
        },
        schedule: function (pattern, callback) {
            if (typeof callback !== 'function') {
                adapter.log.error(name + ': schedule callback missing');
                return;
            }

            sandbox.__engine.__schedules += 1;

            if (pattern.astro) {

                var nowdate = new Date();

                if (adapter.config.latitude === undefined || adapter.config.longitude === undefined ||
                    adapter.config.latitude === '' || adapter.config.longitude === '' ||
                    adapter.config.latitude === null || adapter.config.longitude === null) {
                    adapter.log.error('Longitude or latitude does not set. Cannot use astro.');
                    return;
                }

                var ts = mods.suncalc.getTimes(nowdate, adapter.config.latitude, adapter.config.longitude)[pattern.astro];

                if (ts.getTime().toString() === 'NaN') {
                    adapter.log.warn('Cannot calculate "' + pattern.astro + '" for ' + adapter.config.latitude + ', ' + adapter.config.longitude);
                    ts = new Date(nowdate.getTime());

                    if (pattern.astro === 'sunriseEnd' ||
                        pattern.astro === 'goldenHourEnd' ||
                        pattern.astro === 'sunset' ||
                        pattern.astro === 'nightEnd' ||
                        pattern.astro === 'nauticalDusk') {
                        ts.setMinutes(59);
                        ts.setHours(23);
                        ts.setSeconds(59);
                    } else {
                        ts.setMinutes(59);
                        ts.setHours(23);
                        ts.setSeconds(58);
                    }
                }

                if (ts && pattern.shift) {
                    ts = new Date(ts.getTime() + (pattern.shift * 60000));
                }

                if (!ts || ts < nowdate) {
                    var date = new Date(nowdate);
                    // Event doesn't occur today - try again tomorrow
                    // Calculate time till 24:00 and set timeout
                    date.setDate(date.getDate() + 1);
                    date.setMinutes(1); // Somtimes timer fires at 23:59:59
                    date.setHours(0);
                    date.setSeconds(0);
                    date.setMilliseconds(0);
                    date.setMinutes(-date.getTimezoneOffset());


                    // Calculate new schedule in the next day
                    sandbox.setTimeout(function () {
                        if (sandbox.__engine.__schedules > 0) sandbox.__engine.__schedules--;

                        sandbox.schedule(pattern, callback);
                    }, date.getTime() - nowdate.getTime());

                    return;
                }

                sandbox.setTimeout(function () {
                    try {
                        callback.call(sandbox);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                    // Reschedule in 2 seconds
                    sandbox.setTimeout(function () {
                        if (sandbox.__engine.__schedules > 0) sandbox.__engine.__schedules--;
                        sandbox.schedule(pattern, callback);
                    }, 2000);

                }, ts.getTime() - nowdate.getTime());

                if (sandbox.verbose) sandbox.log('schedule(astro=' + pattern.astro + ', offset=' + pattern.shift + ')', 'info');

            } else {
                // fix problem with sunday and 7
                if (typeof pattern === 'string') {
                    var parts = pattern.replace(/\s+/g, ' ').split(' ');
                    if (parts.length >= 5 && parts[5] >= 7) parts[5] = 0;
                    pattern = parts.join(' ');
                }
                var schedule = mods['node-schedule'].scheduleJob(pattern, function () {
                    try {
                        callback.call(sandbox);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                });

                script.schedules.push(schedule);

                if (sandbox.verbose) sandbox.log('schedule(cron=' + pattern + ')', 'info');

                return schedule;
            }
        },
        getAstroDate: function (pattern, date, offsetMinutes) {
            if (date === undefined) date = new Date();

            if (astroList.indexOf(pattern) === -1) {
                var pos = astroListLow.indexOf(pattern.toLowerCase());
                if (pos !== -1) pattern = astroList[pos];
            }

            if ((!adapter.config.latitude && adapter.config.latitude !== 0) ||
                (!adapter.config.longitude && adapter.config.longitude !== 0)) {
                adapter.log.error('Longitude or latitude does not set. Cannot use astro.');
                return;
            }

            var ts = mods.suncalc.getTimes(date, adapter.config.latitude, adapter.config.longitude)[pattern];

            if (ts === undefined || ts.getTime().toString() === 'NaN') {
                adapter.log.error('Cannot get astro date for "' + pattern + '"');
            }

            if (sandbox.verbose) sandbox.log('getAstroDate(pattern=' + pattern + ', date=' + date + ') => ' + ts, 'info');

            if (offsetMinutes !== undefined) {
                ts = new Date(ts.getTime() + (offsetMinutes * 60000));
            }
            return ts;
        },
        isAstroDay: function () {
            var nowDate = new Date();
            var dayBegin = sandbox.getAstroDate('sunrise');
            var dayEnd = sandbox.getAstroDate('sunset');

            if (dayBegin === undefined || dayEnd === undefined) return;

            if (sandbox.verbose) sandbox.log('isAstroDay() => ' + (nowDate >= dayBegin && nowDate <= dayEnd), 'info');

            return (nowDate >= dayBegin && nowDate <= dayEnd);
        },
        clearSchedule: function (schedule) {
            for (var i = 0; i < script.schedules.length; i++) {
                if (script.schedules[i] === schedule) {
                    if (!mods['node-schedule'].cancelJob(script.schedules[i])) {
                        adapter.log.error('Error by canceling scheduled job');
                    }
                    delete script.schedules[i];
                    script.schedules.splice(i, 1);
                    if (sandbox.verbose) sandbox.log('clearSchedule() => cleared', 'info');
                    return true;
                }
            }
            if (sandbox.verbose) sandbox.log('clearSchedule() => invalid handler', 'warn');
            return false;
        },
        setState: function (id, state, isAck, callback) {
            if (typeof isAck === 'function') {
                callback = isAck;
                isAck = undefined;
            }

            if (state === null) {
                state = {val: null};
            }

            if (isAck === true || isAck === false || isAck === 'true' || isAck === 'false') {
                if (typeof state === 'object') {
                    state.ack = isAck;
                } else {
                    state = {val: state, ack: isAck};
                }
            }

            // Check type of state
            if (!objects[id] && objects[adapter.namespace + '.' + id]) {
                id = adapter.namespace + '.' + id;
            }

            var common = objects[id] ? objects[id].common : null;
            if (common &&
                common.type &&
                common.type !== 'mixed' &&
                common.type !== 'file' &&
                common.type !== 'json') {
                if (state && typeof state === 'object' && state.val !== undefined) {
                    if (common.type !== typeof state.val) {
                        logWithLineInfo.warn('Wrong type of ' + id + ': "' + typeof state.val + '". Please fix, while deprecated and will not work in next versions.');
                        //return;
                    }
                } else {
                    if (common.type !== typeof state) {
                        logWithLineInfo.warn('Wrong type of ' + id + ': "' + typeof state + '". Please fix, while deprecated and will not work in next versions.');
                        //return;
                    }
                }
            }
            // Check min and max of value
            if (typeof state === 'object' && state) {
                if (common && typeof state.val === 'number') {
                    if (common.min !== undefined && state.val < common.min) state.val = common.min;
                    if (common.max !== undefined && state.val > common.max) state.val = common.max;
                }
            } else if (common && typeof state === 'number') {
                if (common.min !== undefined && state < common.min) state = common.min;
                if (common.max !== undefined && state > common.max) state = common.max;
            }

            if (objects[id]) {
                if (sandbox.verbose) sandbox.log('setForeignState(id=' + id + ', state=' + JSON.stringify(state) + ')', 'info');

                if (debug) {
                    sandbox.log('setForeignState(id=' + id + ', state=' + JSON.stringify(state) + ') - ' + words._('was not executed, while debug mode is active'), 'warn');

                    if (typeof callback === 'function') {
                        setTimeout(function () {
                            try {
                                callback.call(sandbox);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }, 0);
                    }
                } else {
                    adapter.setForeignState(id, state, function (err) {
                        if (err) sandbox.log('setForeignState: ' + err, 'error');

                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    });
                }
            } else if (objects[adapter.namespace + '.' + id]) {
                if (sandbox.verbose) sandbox.log('setState(id=' + id + ', state=' + JSON.stringify(state) + ')', 'info');

                if (debug) {
                    sandbox.log('setState(' + id + ', ' + JSON.stringify(state) + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                    if (typeof callback === 'function') {
                        setTimeout(function () {
                            try {
                                callback.call(sandbox);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }, 0);
                    }
                } else {
                    adapter.setState(id, state, function (err) {
                        if (err) sandbox.log('setState: ' + err, 'error');

                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    });
                }
            } else {
                if (objects[id]) {
                    if (objects[id].type === 'state') {
                        if (sandbox.verbose) sandbox.log('setForeignState(id=' + id + ', state=' + JSON.stringify(state) + ')', 'info');

                        if (debug) {
                            sandbox.log('setForeignState(id=' + id + ', state=' + JSON.stringify(state) + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                            if (typeof callback === 'function') {
                                setTimeout(function () {
                                    try {
                                        callback.call(sandbox);
                                    } catch (e) {
                                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                    }
                                }, 0);
                            }
                        } else {
                            adapter.setForeignState(id, state, function (err) {
                                if (err) sandbox.log('setForeignState: ' + err, 'error');

                                if (typeof callback === 'function') {
                                    try {
                                        callback.call(sandbox);
                                    } catch (e) {
                                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                    }
                                }
                            });
                        }
                    } else {
                        adapter.log.warn('Cannot set value of non-state object "' + id + '"');
                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox, 'Cannot set value of non-state object "' + id + '"');
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    }
                } else if (objects[adapter.namespace + '.' + id]) {
                    if (objects[adapter.namespace + '.' + id].type === 'state') {
                        if (sandbox.verbose) sandbox.log('setState(id=' + id + ', state=' + JSON.stringify(state) + ')', 'info');

                        if (debug) {
                            sandbox.log('setState(id=' + id + ', state=' + JSON.stringify(state) + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                            if (typeof callback === 'function') {
                                setTimeout(function () {
                                    try {
                                        callback.call(sandbox);
                                    } catch (e) {
                                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                    }
                                }, 0);
                            }
                        } else {
                            adapter.setState(id, state, function (err) {
                                if (err) sandbox.log('setState: ' + err, 'error');

                                if (typeof callback === 'function') {
                                    try {
                                        callback.call(sandbox);
                                    } catch (e) {
                                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                    }
                                }
                            });
                        }
                    } else {
                        adapter.log.warn('Cannot set value of non-state object "' + adapter.namespace + '.' + id + '"');
                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox, 'Cannot set value of non-state object "' + adapter.namespace + '.' + id + '"');
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    }
                } else {
                    logWithLineInfo.warn('State "' + id + '" not found');
                    if (typeof callback === 'function') {
                        try {
                            callback.call(sandbox, 'State "' + id + '" not found');
                        } catch (e) {
                            errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                        }
                    }
                }
            }
        },
        setStateDelayed: function (id, state, isAck, delay, clearRunning, callback) {
            // find arguments
            if (typeof isAck !== 'boolean') {
                callback = clearRunning;
                clearRunning = delay;
                delay = isAck;
                isAck = false;
            }
            if (typeof delay !== 'number') {
                callback = clearRunning;
                clearRunning = delay;
                delay = 0;
            }
            if (typeof clearRunning !== 'boolean') {
                callback = clearRunning;
                clearRunning = true;
            }

            // Check type of state
            if (!objects[id] && objects[adapter.namespace + '.' + id]) {
                id = adapter.namespace + '.' + id;
            }

            if (clearRunning === undefined) clearRunning = true;

            if (sandbox.verbose) sandbox.log('setStateDelayed(id=' + id + ', state=' + state + ', isAck=' + isAck + ', delay=' + delay + ', clearRunning=' + clearRunning + ')', 'info');

            if (clearRunning) {
                if (timers[id]) {
                    if (sandbox.verbose) sandbox.log('setStateDelayed: clear ' + timers[id].length + ' running timers', 'info');

                    for (var i = 0; i < timers[id].length; i++) {
                        clearTimeout(timers[id][i].t);
                    }
                    delete timers[id];
                } else {
                    if (sandbox.verbose) sandbox.log('setStateDelayed: no running timers', 'info');
                }
            }
            // If no delay => start immediately
            if (!delay) {
                sandbox.setState(id, state, isAck, callback);
                return null;
            } else {
                // If delay
                timers[id] = timers[id] || [];

                // calculate timerId
                timerId++;
                if (timerId > 0xFFFFFFFE) timerId = 0;

                // Start timeout
                var timer = setTimeout(function (_timerId, _id, _state, _isAck) {
                    sandbox.setState(_id, _state, _isAck, callback);
                    // delete timer handler
                    if (timers[_id]) {
                        // optimisation
                        if (timers[_id].length === 1) {
                            delete timers[_id];
                        } else {
                            for (var t = 0; t < timers[_id].length; t++) {
                                if (timers[_id][t].id === _timerId) {
                                    timers[_id].splice(t, 1);
                                    break;
                                }
                            }
                            if (!timers[_id].length) delete timers[_id];
                        }

                    }
                }, delay, timerId, id, state, isAck);

                // add timer handler
                timers[id].push({
                    t: timer,
                    id: timerId,
                    ts: Date.now(),
                    delay: delay,
                    val: typeof state === 'object' && state.val !== undefined ? state.val : state,
                    ack: typeof state === 'object' && state.val !== undefined && state.ack !== undefined ? state.ack : isAck
                });
                return timerId;
            }
        },
        clearStateDelayed: function (id, timerId) {
            // Check type of state
            if (!objects[id] && objects[adapter.namespace + '.' + id]) {
                id = adapter.namespace + '.' + id;
            }

            if (sandbox.verbose) sandbox.log('clearStateDelayed(id=' + id + ', timerId=' + timerId + ')', 'info');

            if (timers[id]) {

                for (var i = timers[id].length - 1; i >= 0; i--) {
                    if (timerId === undefined || timers[id][i].id === timerId) {
                        clearTimeout(timers[id][i].t);
                        if (timerId !== undefined) timers[id].splice(i, 1);
                        if (sandbox.verbose) sandbox.log('clearStateDelayed: clear timer ' + timers[id][i].id, 'info');
                    }
                }
                if (timerId === undefined) {
                    delete timers[id];
                } else {
                    if (!timers[id].length) delete timers[id];
                }
                return true;
            }
            return false;
        },
        getStateDelayed: function (id) {
            var result;
            var now = Date.now();
            if (id) {
                // Check type of state
                if (!objects[id] && objects[adapter.namespace + '.' + id]) {
                    id = adapter.namespace + '.' + id;
                }
                // If timerId given
                if (typeof id === 'number') {
                    for (var _id_ in timers) {
                        if (timers.hasOwnProperty(_id_)) {
                            for (var ttt = 0; ttt < timers[_id_].length; ttt++) {
                                if (timers[_id_][ttt].id === id) {
                                    return {
                                        id: _id_,
                                        left: timers[_id_][ttt].delay - (now - timers[id][ttt].ts),
                                        delay: timers[_id_][ttt].delay,
                                        val: timers[_id_][ttt].val,
                                        ack: timers[_id_][ttt].ack
                                    };
                                }
                            }
                        }
                    }
                    return null;
                }

                result = [];
                if (timers.hasOwnProperty(id) && timers[id] && timers[id].length) {
                    for (var tt = 0; tt < timers[id].length; tt++) {
                        result.push({
                            timerId: timers[id][tt].id,
                            left: timers[id][tt].delay - (now - timers[id][tt].ts),
                            delay: timers[id][tt].delay,
                            val: timers[id][tt].val,
                            ack: timers[id][tt].ack
                        });
                    }
                }
                return result;
            } else {
                result = {};
                for (var _id in timers) {
                    if (timers.hasOwnProperty(_id) && timers[_id] && timers[_id].length) {
                        result[_id] = [];
                        for (var t = 0; t < timers[_id].length; t++) {
                            result[_id].push({
                                timerId: timers[_id][t].id,
                                left: timers[_id][t].delay - (now - timers[_id][t].ts),
                                delay: timers[_id][t].delay,
                                val: timers[_id][t].val,
                                ack: timers[_id][t].ack
                            });
                        }
                    }
                }
            }
            return result;
        },
        getState: function (id, callback) {
            if (typeof callback === 'function') {
                if (id.indexOf('.') === -1) {
                    adapter.getState(id, callback);
                } else {
                    adapter.getForeignState(id, callback);
                }
            } else {
                if (adapter.config.subscribe) {
                    sandbox.log('Cannot use sync getState, use callback instead getState("' + id + '", function (err, state){}); or disable the "Do not subscribe all states on start" option in instance configuration.', 'error');
                } else {
                    if (states[id]) {
                        if (sandbox.verbose) sandbox.log('getState(id=' + id + ', timerId=' + timerId + ') => ' + JSON.stringify(states[id]), 'info');
                        return states[id];
                    }
                    if (states[adapter.namespace + '.' + id]) {
                        if (sandbox.verbose) sandbox.log('getState(id=' + id + ', timerId=' + timerId + ') => ' + states[adapter.namespace + '.' + id], 'info');
                        return states[adapter.namespace + '.' + id];
                    }

                    if (sandbox.verbose) sandbox.log('getState(id=' + id + ', timerId=' + timerId + ') => not found', 'info');

                    logWithLineInfo.warn('getState "' + id + '" not found (3)' + (states[id] !== undefined ? ' states[id]=' + states[id] : ''));     ///xxx
                    return {val: null, notExist: true};
                }
            }
        },
        existsState: function (id) {
            return states.get(id) !== undefined;
        },
        existsObject: function (id) {
            return objects.get(id) !== undefined;
        },
        getIdByName: function (name, alwaysArray) {
            if (sandbox.verbose) sandbox.log('getIdByName(name=' + name + ', alwaysArray=' + alwaysArray + ') => ' + names[name], 'info');
            if (alwaysArray) {
                if (typeof names[name] === 'string') {
                    return [names[name]];
                }
                return names[name];
            } else {
                return names[name];
            }
        },
        getObject: function (id, enumName) {
            if (!objects[id]) {
                if (sandbox.verbose) sandbox.log('getObject(id=' + id + ', enumName=' + enumName + ') => does not exist', 'info');
                adapter.log.warn('Object "' + id + '" does not exist');
                return null;
            } else if (enumName) {
                var e = getObjectEnumsSync(id);
                var obj = JSON.parse(JSON.stringify(objects[id]));
                obj.enumIds = JSON.parse(JSON.stringify(e.enumIds));
                obj.enumNames = JSON.parse(JSON.stringify(e.enumNames));
                if (typeof enumName === 'string') {
                    var r = new RegExp('^enum\.' + enumName + '\.');
                    for (var i = obj.enumIds.length - 1; i >= 0; i--) {
                        if (!r.test(obj.enumIds[i])) {
                            obj.enumIds.splice(i, 1);
                            obj.enumNames.splice(i, 1);
                        }
                    }
                }
                if (sandbox.verbose) sandbox.log('getObject(id=' + id + ', enumName=' + enumName + ') => ' + JSON.stringify(obj), 'info');

                return obj;
            } else {
                var result;
                try {
                    result = JSON.parse(JSON.stringify(objects[id]));
                } catch (err) {
                    adapter.log.error('Object "' + id + '" can\'t be copied');
                    return null;
                }
                if (sandbox.verbose) sandbox.log('getObject(id=' + id + ', enumName=' + enumName + ') => ' + JSON.stringify(result), 'info');
                return result;
            }
        },
        setObject: function (id, obj, callback) {
            adapter.log.error('Function "setObject" is not allowed. Use adapter settings to allow it.');
            if (typeof callback === 'function') {
                try {
                    callback.call(sandbox, 'Function "setObject" is not allowed. Use adapter settings to allow it.');
                } catch (e) {
                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                }
            }
        },
        extendObject: function (id, obj, callback) {
            adapter.log.error('Function "extendObject" is not allowed. Use adapter settings to allow it.');
            if (typeof callback === 'function') {
                try {
                    callback.call(sandbox, 'Function "extendObject" is not allowed. Use adapter settings to allow it.');
                } catch (e) {
                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                }
            }
        },
        getEnums: function (enumName) {
            var result = [];
            var r = enumName ? new RegExp('^enum\.' + enumName + '\.') : false;
            for (var i = 0; i < enums.length; i++) {
                if (!r || r.test(enums[i])) {
                    result.push({
                        id: enums[i],
                        members: (objects[enums[i]].common) ? objects[enums[i]].common.members : [],
                        name: objects[enums[i]].common.name
                    });
                }
            }
            if (sandbox.verbose) sandbox.log('getEnums(enumName=' + enumName + ') => ' + JSON.stringify(result), 'info');
            return JSON.parse(JSON.stringify(result));
        },
        createState: function (name, initValue, forceCreation, common, native, callback) {
            if (typeof native === 'function') {
                callback = native;
                native = {};
            }
            if (typeof common === 'function') {
                callback = common;
                common = undefined;
            }
            if (typeof initValue === 'function') {
                callback = initValue;
                initValue = undefined;
            }
            if (typeof forceCreation === 'function') {
                callback = forceCreation;
                forceCreation = undefined;
            }
            if (typeof initValue === 'object') {
                common = initValue;
                native = forceCreation;
                forceCreation = undefined;
                initValue = undefined;
            }
            if (typeof forceCreation === 'object') {
                common = forceCreation;
                native = common;
                forceCreation = undefined;
            }
            common = common || {};
            common.name = common.name || name;
            common.role = common.role || 'javascript';
            common.type = common.type || 'mixed';
            if (initValue === undefined) initValue = common.def;

            native = native || {};

            // Check min, max and def values for number
            if (common.type !== undefined && common.type === 'number') {
                var min = 0;
                var max = 0;
                var def = 0;
                var err;
                if (common.min !== undefined) {
                    min = common.min;
                    if (typeof min !== 'number') {
                        min = parseFloat(min);
                        if (isNaN(min)) {
                            err = 'Wrong type of ' + id + '.common.min';
                            sandbox.log(err, 'error');
                            if (typeof callback === 'function') {
                                try {
                                    callback.call(sandbox, err);
                                } catch (e) {
                                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                }
                            }
                            return;
                        } else {
                            common.min = min;
                        }
                    }
                }
                if (common.max !== undefined) {
                    max = common.max;
                    if (typeof max !== 'number') {
                        max = parseFloat(max);
                        if (isNaN(max)) {
                            err = 'Wrong type of ' + name + '.common.max';
                            sandbox.log(err, 'error');
                            if (typeof callback === 'function') {
                                try {
                                    callback.call(sandbox, err);
                                } catch (e) {
                                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                }
                            }
                            return;
                        } else {
                            common.max = max;
                        }
                    }
                }
                if (common.def !== undefined) {
                    def = common.def;
                    if (typeof def !== 'number') {
                        def = parseFloat(def);
                        if (isNaN(def)) {
                            err = 'Wrong type of ' + name + '.common.def';
                            sandbox.log(err, 'error');
                            if (typeof callback === 'function') {
                                try {
                                    callback.call(sandbox, err);
                                } catch (e) {
                                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                                }
                            }
                            return;
                        } else {
                            common.def = def;
                        }
                    }
                }
                if (common.min !== undefined && common.max !== undefined && min > max) {
                    common.max = min;
                    common.min = max;
                }
                if (common.def !== undefined && common.min !== undefined && def < min) common.def = min;
                if (common.def !== undefined && common.max !== undefined && def > max) common.def = max;
            }

            if (sandbox.verbose) sandbox.log('createState(name=' + name + ', initValue=' + initValue + ', forceCreation=' + forceCreation + ', common=' + JSON.stringify(common) + ', native=' + JSON.stringify(native) + ')', 'debug');

            if (forceCreation) {
                // todo: store object in objects to have this object directly after callback
                adapter.setObject(name, {
                    common: common,
                    native: native,
                    type: 'state'
                }, function (err) {
                    if (err) adapter.log.warn('Cannot set object "' + name + '": ' + err);

                    if (initValue !== undefined) {
                        if (typeof initValue === 'object' && initValue.ack !== undefined) {
                            adapter.setState(name, initValue, callback);
                        } else {
                            adapter.setState(name, initValue, true, callback);
                        }
                    } else {
                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox, name);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    }
                });
            } else {
                adapter.getObject(name, function (err, obj) {
                    if (err || !obj) {
                        // todo: store object in objects to have this object directly after callback
                        // create new one
                        if (name.match(/^javascript\.\d+\./)) {
                            adapter.setForeignObject(name, {
                                common: common,
                                native: native,
                                type: 'state'
                            }, function (err) {
                                if (err) adapter.log.warn('Cannot set object "' + name + '": ' + err);

                                if (initValue !== undefined) {
                                    adapter.setForeignState(name, initValue, callback);
                                    if (typeof initValue === 'object' && initValue.ack !== undefined) {
                                        adapter.setForeignState(name, initValue, callback);
                                    } else {
                                        adapter.setForeignState(name, initValue, true, callback);
                                    }
                                } else {
                                    adapter.setForeignState(name, null, true, callback);
                                }
                            });
                        } else {
                            adapter.setObject(name, {
                                common: common,
                                native: native,
                                type: 'state'
                            }, function (err) {
                                if (err) adapter.log.warn('Cannot set object "' + name + '": ' + err);

                                if (initValue !== undefined) {
                                    if (typeof initValue === 'object' && initValue.ack !== undefined) {
                                        adapter.setState(name, initValue, callback);
                                    } else {
                                        adapter.setState(name, initValue, true, callback);
                                    }
                                } else {
                                    adapter.setState(name, null, true, callback);
                                }
                            });

                        }
                    } else {
                        if (!adapter.config.subscribe && !states[name] && !states[adapter.namespace + '.' + name]) {
                            if (name.substring(0, adapter.namespace.length) !== adapter.namespace) {
                                states[adapter.namespace + '.' + name] = {val: null, ack: true};
                            } else {
                                states[name] = {val: null, ack: true};
                            }
                        }
                        // state yet exists
                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox, name);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    }
                });
            }
        },
        deleteState: function (id, callback) {
            // todo: check rights
            var found = false;
            if (objects[id]) {
                found = true;
                delete objects[id];
            }
            if (states[id]) delete states[id];
            if (objects[adapter.namespace + '.' + id]) {
                delete objects[adapter.namespace + '.' + id];
                found = true;
            }
            if (states[adapter.namespace + '.' + id]) delete states[adapter.namespace + '.' + id];

            if (sandbox.verbose) sandbox.log('deleteState(id=' + id + ')', 'debug');
            adapter.delObject(id, function (err) {
                if (err) adapter.log.warn('Object for state "' + id + '" does not exist: ' + err);

                adapter.delState(id, function (err) {
                    if (err) adapter.log.error('Cannot delete state "' + id + '": ' + err);
                    if (typeof callback === 'function') {
                        if (typeof callback === 'function') {
                            try {
                                callback.call(sandbox, err, found);
                            } catch (e) {
                                errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                            }
                        }
                    }
                });

            });
        },
        sendTo: function (_adapter, cmd, msg, callback) {
            if (sandbox.verbose) sandbox.log('sendTo(adapter=' + _adapter + ', cmd=' + cmd + ', msg=' + JSON.stringify(msg) + ')', 'info');
            adapter.sendTo(_adapter, cmd, msg, callback);
        },
        sendto: function (_adapter, cmd, msg, callback) {
            return sandbox.sendTo(_adapter, cmd, msg, callback);
        },
        sendToHost: function (host, cmd, msg, callback) {
            if (!adapter.config.enableSendToHost) {
                var error = 'sendToHost is not available. Please enable "Enable SendToHost" option in instance settings';
                adapter.log.error(error);
                sandbox.log(error);
                if (typeof callback === 'function') {
                    setImmediate(function () {
                        callback(error);
                    });
                }
            } else {
                if (sandbox.verbose) sandbox.log('sendToHost(adapter=' + host + ', cmd=' + cmd + ', msg=' + JSON.stringify(msg) + ')', 'info');
                adapter.sendToHost(host, cmd, msg, callback);
            }
        },
        setInterval: function (callback, ms, arg1, arg2, arg3, arg4) {
            var int = setInterval(function (_arg1, _arg2, _arg3, _arg4) {
                if (typeof callback === 'function') {
                    try {
                        callback.call(sandbox, _arg1, _arg2, _arg3, _arg4);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                }
            }, ms, arg1, arg2, arg3, arg4);
            script.intervals.push(int);

            if (sandbox.verbose) sandbox.log('setInterval(ms=' + ms + ')', 'info');

            return int;
        },
        clearInterval: function (id) {
            var pos = script.intervals.indexOf(id);
            if (pos !== -1) {
                if (sandbox.verbose) sandbox.log('clearInterval() => cleared', 'info');
                clearInterval(id);
                script.intervals.splice(pos, 1);
            } else {
                if (sandbox.verbose) sandbox.log('clearInterval() => not found', 'warn');
            }
        },
        setTimeout: function (callback, ms, arg1, arg2, arg3, arg4) {
            var to = setTimeout(function (_arg1, _arg2, _arg3, _arg4) {
                // Remove timeout from the list
                var pos = script.timeouts.indexOf(to);
                if (pos !== -1) script.timeouts.splice(pos, 1);

                if (typeof callback === 'function') {
                    try {
                        callback.call(sandbox, _arg1, _arg2, _arg3, _arg4);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                }
            }, ms, arg1, arg2, arg3, arg4);

            if (sandbox.verbose) sandbox.log('setTimeout(ms=' + ms + ')', 'info');

            script.timeouts.push(to);
            return to;
        },
        clearTimeout: function (id) {
            var pos = script.timeouts.indexOf(id);
            if (pos !== -1) {
                if (sandbox.verbose) sandbox.log('clearTimeout() => cleared', 'info');
                clearTimeout(id);
                script.timeouts.splice(pos, 1);
            } else {
                if (sandbox.verbose) sandbox.log('clearTimeout() => not found', 'warn');
            }
        },
        cb: function (callback) {
            return function () {
                if (scripts[name] && scripts[name]._id === sandbox._id) {
                    if (typeof callback === 'function') {
                        try {
                            callback.apply(this, arguments);
                        } catch (e) {
                            errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                        }
                    }
                } else {
                    adapter.log.warn('Callback for old version of script: ' + name);
                }
            };
        },
        compareTime: function (startTime, endTime, operation, time) {
            var pos;
            if (startTime && typeof startTime === 'string') {
                if ((pos = astroListLow.indexOf(startTime.toLowerCase())) !== -1) {
                    startTime = sandbox.getAstroDate(astroList[pos]);
                    startTime = startTime.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                }
            } else if (startTime && typeof startTime === 'object' && startTime.astro) {
                startTime = sandbox.getAstroDate(startTime.astro, startTime.date || new Date(), startTime.offset || 0);
                startTime = startTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
            if (endTime && typeof endTime === 'string') {
                if ((pos = astroListLow.indexOf(endTime.toLowerCase())) !== -1) {
                    endTime = sandbox.getAstroDate(astroList[pos]);
                    endTime = endTime.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                }
            } else if (endTime && typeof endTime === 'object' && endTime.astro) {
                endTime = sandbox.getAstroDate(endTime.astro, endTime.date || new Date(), endTime.offset || 0);
                endTime = endTime.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
            }
            if (time && typeof time === 'string') {
                if ((pos = astroListLow.indexOf(time.toLowerCase())) !== -1) {
                    time = sandbox.getAstroDate(astroList[pos]);
                }
            } else if (time && typeof time === 'object' && time.astro) {
                time = sandbox.getAstroDate(time.astro, time.date || new Date(), time.offset || 0);
            }

            var daily = true;
            if (time) {
                daily = false;
            }
            if (time && typeof time !== 'object') {
                if (typeof time === 'string' && time.indexOf(' ') === -1 && time.indexOf('T') === -1) {
                    var parts = time.split(':');
                    time = new Date();
                    time.setHours(parseInt(parts[0], 10));
                    time.setMinutes(parseInt(parts[1], 10));
                    time.setMilliseconds(0);

                    if (parts.length === 3) {
                        time.setSeconds(parseInt(parts[2], 10));
                    } else {
                        time.setSeconds(0);
                    }
                } else {
                    time = new Date(time);
                }
            } else if (!time) {
                time = new Date();
                time.setMilliseconds(0);
            }

            if (typeof startTime === 'string') {
                if (startTime.indexOf(' ') === -1 && startTime.indexOf('T') === -1) {
                    var parts = startTime.split(':');
                    startTime = new Date();
                    startTime.setHours(parseInt(parts[0], 10));
                    startTime.setMinutes(parseInt(parts[1], 10));
                    startTime.setMilliseconds(0);

                    if (parts.length === 3) {
                        startTime.setSeconds(parseInt(parts[2], 10));
                    } else {
                        startTime.setSeconds(0);
                    }
                } else {
                    daily = false;
                    startTime = new Date(startTime);
                }
            } else {
                daily = false;
                startTime = new Date(startTime);
            }
            startTime = startTime.getTime();

            if (endTime && typeof endTime === 'string') {
                if (endTime.indexOf(' ') === -1 && endTime.indexOf('T') === -1) {
                    var parts = endTime.split(':');
                    endTime = new Date();
                    endTime.setHours(parseInt(parts[0], 10));
                    endTime.setMinutes(parseInt(parts[1], 10));
                    endTime.setMilliseconds(0);

                    if (parts.length === 3) {
                        endTime.setSeconds(parseInt(parts[2], 10));
                    } else {
                        endTime.setSeconds(0);
                    }
                } else {
                    daily = false;
                    endTime = new Date(endTime);
                }
            } else if (endTime) {
                daily = false;
                endTime = new Date(endTime);
            } else {
                endTime = null;
            }

            if (endTime) endTime = endTime.getTime();

            if (operation === 'between') {
                if (endTime) {
                    if (startTime > endTime && daily) return !(time >= endTime && time < startTime);
                    else return time >= startTime && time < endTime;
                } else {
                    adapter.log.warn('missing or unrecognized endTime expression: ' + endTime);
                    return false;
                }
            } else if (operation === 'not between') {
                if (endTime) {
                    if (startTime > endTime && daily) return time >= endTime && time < startTime;
                    else return !(time >= startTime && time < endTime);
                } else {
                    adapter.log.warn('missing or unrecognized endTime expression: ' + endTime);
                    return false;
                }
            } else if (operation === '>') {
                return time > startTime;
            } else if (operation === '>=') {
                return time >= startTime;
            } else if (operation === '<') {
                return time < startTime;
            } else if (operation === '<=') {
                return time <= startTime;
            } else if (operation === '==') {
                return time === startTime;
            } else if (operation === '<>') {
                return time !== startTime;
            } else {
                adapter.log.warn('Invalid operator: ' + operation);
                return false;
            }
        },
        onStop: function (cb, timeout) {
            if (sandbox.verbose) sandbox.log('onStop(timeout=' + timeout + ')', 'info');

            script.onStopCb = cb;
            script.onStopTimeout = timeout || 1000;
        },
        formatValue: function (value, decimals, format) {
            if (!format && objects['system.config']) {
                format = objects['system.config'].common.isFloatComma ? '.,' : ',.';
            }
            return adapter.formatValue(value, decimals, format);
        },

        formatDate: function (date, format, language) {
            if (!format) {
                format = objects['system.config'] ? (objects['system.config'].common.dateFormat || 'DD.MM.YYYY') : 'DD.MM.YYYY';
            }
            if (format.match(/W|Н|O|О/)) {
                var text = adapter.formatDate(date, format);
                if (!language || !dayOfWeeksFull[language]) language = objects['system.config'].common.language;
                var d = date.getDay();
                text = text.replace('WW', dayOfWeeksFull[language][d]);
                text = text.replace('НН', dayOfWeeksFull[language][d]);
                text = text.replace('W', dayOfWeeksShort[language][d]);
                text = text.replace('Н', dayOfWeeksShort[language][d]);
                var m = date.getMonth();
                text = text.replace('OOO', monthFullGen[language][m]);
                text = text.replace('ООО', monthFullGen[language][m]);
                text = text.replace('OO', monthFull[language][m]);
                text = text.replace('ОО', monthFull[language][m]);
                text = text.replace('O', monthShort[language][m]);
                text = text.replace('О', monthShort[language][m]);
                return text;
            } else {
                return adapter.formatDate(date, format);
            }
        },

        getDateObject: function (date) {
            if (typeof date === 'object') return date;
            if (typeof date !== 'string') return new Date(date);
            if (date.match(/^\d?\d$/)) {
                var _now = new Date();
                date = _now.getFullYear() + '-' + (_now.getMonth() + 1) + '-' + _now.getDate() + ' ' + date + ':00';
            } else
            // 20:00, 2:00, 20:00:00, 2:00:00
            if (date.match(/^\d?\d:\d\d(:\d\d)?$/)) {
                var now = new Date();
                date = now.getFullYear() + '-' + (now.getMonth() + 1) + '-' + now.getDate() + ' ' + date;
            }
            return new Date(date);
        },

        writeFile: function (_adapter, fileName, data, callback) {
            if (typeof data === 'function' || !data) {
                callback = data;
                data = fileName;
                fileName = _adapter;
                _adapter = null;
            }

            if (debug) {
                sandbox.log('readFile(adapter=' + _adapter + ', fileName=' + fileName + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                if (typeof callback === 'function') {
                    setTimeout(function () {
                        try {
                            callback.call(sandbox);
                        } catch (e) {
                            errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                        }
                    }, 0);
                }
            } else {
                if (sandbox.verbose) sandbox.log('readFile(adapter=' + _adapter + ', fileName=' + fileName + ')', 'info');
                adapter.writeFile(_adapter, fileName, data, callback);
            }
        },
        readFile: function (_adapter, fileName, callback) {
            if (typeof fileName === 'function') {
                callback = fileName;
                fileName = _adapter;
                _adapter = null;
            }
            if (sandbox.verbose) sandbox.log('readFile(adapter=' + _adapter + ', fileName=' + fileName + ')', 'info');

            adapter.readFile(_adapter, fileName, callback);
        },
        unlink: function (_adapter, fileName, callback) {
            if (typeof fileName === 'function') {
                callback = fileName;
                fileName = _adapter;
                _adapter = null;
            }
            if (sandbox.verbose) sandbox.log('unlink(adapter=' + _adapter + ', fileName=' + fileName + ')', 'info');

            if (debug) {
                sandbox.log('unlink(adapter=' + _adapter + ', fileName=' + fileName + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                if (typeof callback === 'function') {
                    setTimeout(function () {
                        try {
                            callback.call(sandbox);
                        } catch (e) {
                            errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                        }
                    }, 0);
                }
            } else {
                if (sandbox.verbose) sandbox.log('unlink(adapter=' + _adapter + ', fileName=' + fileName + ')', 'info');
                adapter.unlink(_adapter, fileName, callback);
            }
        },
        delFile: function (_adapter, fileName, callback) {
            return sandbox.unlink(_adapter, fileName, callback);
        },
        getHistory: function (instance, options, callback) {
            if (typeof instance === 'object') {
                callback = options;
                options = instance;
                instance = null;
            }

            if (typeof callback !== 'function') {
                adapter.log.error('No callback found!');
                return;
            }
            if (typeof options !== 'object') {
                adapter.log.error('No options found!');
                return;
            }
            if (!options.id) {
                adapter.log.error('No ID found!');
                return;
            }
            var timeoutMs = parseInt(options.timeout, 10) || 20000;

            if (!instance) {
                instance = objects['system.config'] ? objects['system.config'].common.defaultHistory : null;
            }

            if (sandbox.verbose) sandbox.log('getHistory(instance=' + instance + ', options=' + JSON.stringify(options) + ')', 'debug');

            if (!instance) {
                adapter.log.error('No default history instance found!');
                try {
                    callback.call(sandbox, 'No default history instance found!');
                } catch (e) {
                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                }
                return;
            }
            if (instance.match(/^system\.adapter\./)) instance = instance.substring('system.adapter.'.length);

            if (!objects['system.adapter.' + instance]) {
                adapter.log.error('Instance "' + instance + '" not found!');
                try {
                    callback.call(sandbox, 'Instance "' + instance + '" not found!');
                } catch (e) {
                    errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                }
                return;
            }
            var timeout = setTimeout(function () {
                timeout = null;

                if (sandbox.verbose) sandbox.log('getHistory => timeout', 'debug');

                if (typeof callback === 'function') {
                    try {
                        callback.call(sandbox, 'Timeout', null, options, instance);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                    callback = null;
                }
            }, timeoutMs);

            adapter.sendTo(instance, 'getHistory', {id: options.id, options: options}, function (result) {
                if (timeout) clearTimeout(timeout);

                if (sandbox.verbose && result.error) sandbox.log('getHistory => ' + result.error, 'error');
                if (sandbox.verbose && result.result) sandbox.log('getHistory => ' + result.result.length + ' items', 'debug');

                if (typeof callback === 'function') {
                    try {
                        callback.call(sandbox, result.error, result.result, options, instance);
                    } catch (e) {
                        errorInCallback(e) //adapter.log.error('Error in callback: ' + e)
                    }
                    callback = null;
                }

            });
        },
        runScript: function (scriptName, callback) {
            scriptName = scriptName || name;
            if (!scriptName.match(/^script\.js\./)) scriptName = 'script.js.' + scriptName;
            // start other script
            if (!objects[scriptName] || !objects[scriptName].common) {
                sandbox.log('Cannot start "' + scriptName + '", because not found', 'error');
                return false;
            } else {
                if (debug) {
                    sandbox.log('runScript(scriptName=' + scriptName + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                } else {
                    if (objects[scriptName].common.enabled) {
                        objects[scriptName].common.enabled = false;
                        adapter.extendForeignObject(scriptName, {common: {enabled: false}}, function (/* err, obj */) {
                            adapter.extendForeignObject(scriptName, {common: {enabled: true}}, function (err) {
                                if (callback === 'function') callback(err);
                            });
                            scriptName = null;
                        });
                    } else {
                        adapter.extendForeignObject(scriptName, {common: {enabled: true}}, function (err) {
                            if (callback === 'function') callback(err);
                        });
                    }
                }
                return true;
            }
        },
        startScript: function (scriptName, ignoreIfStarted, callback) {
            if (typeof ignoreIfStarted === 'function') {
                callback = ignoreIfStarted;
                ignoreIfStarted = false;
            }
            scriptName = scriptName || name;
            if (!scriptName.match(/^script\.js\./)) scriptName = 'script.js.' + scriptName;
            // start other script
            if (!objects[scriptName] || !objects[scriptName].common) {
                sandbox.log('Cannot start "' + scriptName + '", because not found', 'error');
                return false;
            } else {
                console.log('STARTING!');
                if (debug) {
                    sandbox.log('startScript(scriptName=' + scriptName + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                } else {
                    if (objects[scriptName].common.enabled) {
                        if (!ignoreIfStarted) {
                            objects[scriptName].common.enabled = false;
                            adapter.extendForeignObject(scriptName, {common: {enabled: false}}, function (err) {
                                adapter.extendForeignObject(scriptName, {common: {enabled: true}}, function (err) {
                                    if (callback === 'function') callback(err, true);
                                });
                                scriptName = null;
                            });
                        } else if (callback === 'function') {
                            callback(null, false);
                        }
                    } else {
                        adapter.extendForeignObject(scriptName, {common: {enabled: true}}, function (err) {
                            if (callback === 'function') callback(err, true);
                        });
                    }
                }
                return true;
            }
        },
        stopScript: function (scriptName, callback) {
            scriptName = scriptName || name;

            if (!scriptName.match(/^script\.js\./)) scriptName = 'script.js.' + scriptName;

            // stop other script
            if (!objects[scriptName] || !objects[scriptName].common) {
                sandbox.log('Cannot stop "' + scriptName + '", because not found', 'error');
                return false;
            } else {
                if (debug) {
                    sandbox.log('stopScript(scriptName=' + scriptName + ') - ' + words._('was not executed, while debug mode is active'), 'warn');
                } else {
                    if (objects[scriptName].common.enabled) {
                        objects[scriptName].common.enabled = false;
                        adapter.extendForeignObject(scriptName, {common: {enabled: false}}, function (err) {
                            if (callback === 'function') callback(err, true);
                            scriptName = null;
                        });
                    } else if (callback === 'function') {
                        callback(null, false);
                    }
                }
                return true;
            }
        },
        isScriptActive: function (scriptName) {
            if (!scriptName.match(/^script\.js\./)) scriptName = 'script.js.' + scriptName;
            if (!objects[scriptName] || !objects[scriptName].common) {
                sandbox.log('Script does not exist', 'error');
                return false;
            } else {
                return objects[scriptName].common.enabled;
            }
        },
        toInt: function (val) {
            if (val === true || val === 'true') val = 1;
            if (val === false || val === 'false') val = 0;
            val = parseInt(val) || 0;
            return val;
        },
        toFloat: function (val) {
            if (val === true || val === 'true') val = 1;
            if (val === false || val === 'false') val = 0;
            val = parseFloat(val) || 0;
            return val;
        },
        toBoolean: function (val) {
            if (val === '1' || val === 'true') val = true;
            if (val === '0' || val === 'false') val = false;
            return !!val;
        },
        console: {
            log: function (msg) {
                sandbox.log(msg, 'info');
            },
            error: function (msg) {
                sandbox.log(msg, 'error');
            },
            warn: function (msg) {
                sandbox.log(msg, 'warn');
            },
            debug: function (msg) {
                sandbox.log(msg, 'debug');
            }
        }
    }

function unsubscribePattern(script, pattern) {
    if (adapter.config.subscribe) {
        if (script.subscribes[pattern]) {
            script.subscribes[pattern]--;
            if (!script.subscribes[pattern]) delete script.subscribes[pattern];
        }

        if (subscribedPatterns[pattern]) {
            subscribedPatterns[pattern]--;
            if (!subscribedPatterns[pattern]) {
                adapter.unsubscribeForeignStates(pattern);
                delete subscribedPatterns[pattern];

                // if pattern was regex or with * some states will stay in RAM, but it is OK.
                if (states[pattern]) delete states[pattern];
            }
        }
    }
}

function subscribePattern(script, pattern) {
    if (adapter.config.subscribe) {
        if (!script.subscribes[pattern]) {
            script.subscribes[pattern] = 1;
        } else {
            script.subscribes[pattern]++;
        }

        if (!subscribedPatterns[pattern]) {
            subscribedPatterns[pattern] = 1;
            adapter.subscribeForeignStates(pattern);

            // request current value to deliver old value on change.
            if (typeof pattern === 'string' && pattern.indexOf('*') === -1) {
                adapter.getForeignState(pattern, function (err, state) {
                    if (state) states[pattern] = state;
                });
            } else {
                adapter.getForeignStates(pattern, function (err, _states) {
                    if (_states) {
                        for (var id in _states) {
                            if (!_states.hasOwnProperty(id)) continue;
                            states[id] = _states[id];
                        }
                    }
                });
            }
        } else {
            subscribedPatterns[pattern]++;
        }
    }
}

function getPatternCompareFunctions(pattern) {
    var func, functions = [];
    functions.logic = pattern.logic || 'and';
    //adapter.log.info('## '+JSON.stringify(pattern));
    for (var key in pattern) {
        if (key === 'logic') continue;
        if (key === 'change' && pattern.change === 'any') continue;
        if (!(func = patternCompareFunctions[key])) continue;
        if (typeof (func = func(pattern)) !== 'function') continue;
        functions.push(func);
    }
    return functions;
}

function on(pattern, callbackOrId, value) {
    sandbox.on(pattern, callbackOrId, value);
}

//eval(fs.readFileSync(__dirname + "/iobroker.js") + '');
//eval(fs.readFileSync(__dirname + "/test.js") + '');

on({
    id: 'paul',
    change: 'ne'
}, function (data) {
    if (data.newState.val === 1 ) { // eingeschaltet
        // hochzählen
        hochzaehlen();
    }
});


console.log(subscriptions);