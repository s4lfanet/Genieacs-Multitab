// ALIJAYA-NET IPTR069
let result = '';

if ("value" in args[1]) {
    result = args[1].value[0];
} else {
    let keys = [
        "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress",
        //"InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress"
    ];

    result = getParameterValue(keys);
}

log("IPTR069: " + result);
return {writable: false, value: [result, "xsd:string"]};

function getParameterValue(keys) {
    for (let key of keys) {
        let d = declare(key, {path: Date.now() - 3590000, value: Date.now() - 120 * 1000});

        for (let item of d) {
            if (item.value && item.value[0]) {
                return item.value[0];
            }
        }
    }

    return '';
}
