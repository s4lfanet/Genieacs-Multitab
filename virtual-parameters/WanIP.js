// ALIJAYA-NET WanIP
// Utamakan WAN PPPoE (semua WANConnectionDevice), lalu WAN IP. Mendukung Nokia/ALCL (PPPoE di WCD.2+).
const hourly = Date.now() - 3590000;
let result = '';

if ("value" in args[1]) {
    result = args[1].value[0];
} else {
    let keys = [
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress',
        'InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANIPConnection.*.ExternalIPAddress',
        'Device.IP.Interface.1.IPv4Address.1.IPAddress'
    ];

    result = getParameterValue(keys);
}

log("WanIP: " + result);
return {writable: false, value: [result, "xsd:string"]};

function getParameterValue(keys) {
    for (let key of keys) {
        let d = declare(key, {path: hourly, value: Date.now() - 120 * 1000});

        for (let item of d) {
            if (item.value && item.value[0] && item.value[0] !== '0.0.0.0') {
                return item.value[0];
            }
        }
    }

    return '';
}
