// ALIJAYA-NET
// Jumlah client WiFi (TotalAssociations). Selalu mengembalikan nilai untuk semua merk,
// supaya refresh VirtualParameters tidak fault di merk yang tidak dikenal (mis. Nokia/ALCL).
const brand = declare('DeviceID.Manufacturer', {value: 1}).value[0];
const now = Date.now();
let result = "";

if ("value" in args[1]) {
    result = args[1].value[0];
} else {
    let keys = [
        'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations',
    ];
    // Nokia: SSID 5GHz utama ada di WLANConfiguration.5
    if (brand === 'ALCL') keys.push('InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.TotalAssociations');

    let totalConnections = 0;
    for (let key of keys) {
        let d = declare(key, {path: now - 3590000, value: now});

        for (let item of d) {
            if (item.value && item.value[0]) {
                totalConnections += parseInt(item.value[0]);
            }
        }
    }

    result = totalConnections.toString();
}

log('userconnected: ' + result);
return {writable: false, value: [result, "xsd:string"]};
