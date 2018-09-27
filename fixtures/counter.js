var state = {
    val: 1,
    ack: true
}

sandbox.adapter.stateChange('javascript.0.Status.Spuelmaschine', state);

sandbox.adapter.getState(
    'javascript.0.Status.Spuelmaschine.Zaehler.Jahr',
    function(state){
        console.log('>' + state.val)
    }
);

var state = {
    val: 1,
    ack: true
}

sandbox.adapter.stateChange('javascript.0.Status.Spuelmaschine', state);

sandbox.adapter.getState(
    'javascript.0.Status.Spuelmaschine.Zaehler.Jahr',
    function(state){
        console.log('>>>' + state.val)
    }
);