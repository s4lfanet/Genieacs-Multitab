// ALIJAYA-NET pppUsername

const brand = declare('DeviceID.Manufacturer', {value: 1}).value[0];
let result = '';
const now = Date.now();

if ("value" in args[1]) {
    result = args[1].value[0];
} else {
    let keys = [
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.Username',
        'Device.PPP.Interface.*.Username',
    ];

    result = getParameterValue(keys);
}

log('pppUsername: ' + result);
return {writable: false, value: [result, "xsd:string"]};

function getParameterValue(keys) {
    for (let key of keys) {
        let d = declare(key, {path: now - 3590000, value: now});

        for (let item of d) {
            if (item.value && item.value[0]) {
                return item.value[0];
            }
        }
    }

    return '-';
}
