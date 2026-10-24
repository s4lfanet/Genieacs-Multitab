// ALIJAYA-NET pppoeIP New
// Path (struktur WAN) cukup di-discover per jam; nilai IP tetap diambil tiap 2 menit.
const hourly = Date.now() - 3590000;
let result = '';

if ("value" in args[1]) {
    result = args[1].value[0];
}

if (result === '') {
    result = getPppIp() || getValue('Device.IP.Interface.1.IPv4Address.1.IPAddress');
}

log("pppoeIP: " + result);
return {writable: false, value: [result, "xsd:string"]};

function getPppIp() {
    let d = declare('InternetGatewayDevice.WANDevice.*.WANConnectionDevice.*.WANPPPConnection.*.ExternalIPAddress', {path: hourly, value: Date.now() - 120 * 1000});

    for (let item of d) {
        if (!item.value || !item.value[0] || item.value[0] === '0.0.0.0') continue;

        // lewati WAN mode bridge
        let type = declare(item.path.replace(/ExternalIPAddress$/, 'ConnectionType'), {value: hourly});
        if (type.size && type.value[0] === 'bridge') continue;

        return item.value[0];
    }

    return '';
}

function getValue(key) {
    let d = declare(key, {path: hourly, value: Date.now() - 120 * 1000});

    for (let item of d) {
        if (item.value && item.value[0] && item.value[0] !== '0.0.0.0') {
            return item.value[0];
        }
    }

    return '';
}
