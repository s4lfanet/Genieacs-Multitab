// Provision inform - Fixed (deterministic ConnReqPass - no random to avoid too_many_commits)
const url = "http://GANTI_IP_ACS:7547"; // GANTI: alamat CWMP GenieACS Anda
const informInterval = 300;

const daily = Date.now() - 86400000;

const AcsUser = "GANTI_USER_ACS"; // GANTI: sama dengan auth CWMP di server
const AcsPass = "GANTI_PASS_ACS";

let deviceId = declare("DeviceID.ID", {value: 1}).value[0];
let cleanedDeviceId = String(deviceId).replace(/[^a-zA-Z0-9]/g, '');
let ConnReqUser = cleanedDeviceId.slice(-16);

// Deterministic password based on device ID - avoids too_many_commits from random re-evaluation.
// Random passwords change every provision evaluation causing infinite commit loops in GenieACS.
const _base = cleanedDeviceId.padEnd(24, 'X');
const ConnReqPass = "Cs" + _base.slice(4, 14) + "@4";

const brand = declare('DeviceID.Manufacturer', {value: 1}).value[0];

if (brand !== "MikroTik") {
    declare("InternetGatewayDevice.ManagementServer.Username", {value: daily}, {value: AcsUser});
    declare("InternetGatewayDevice.ManagementServer.Password", {value: daily}, {value: AcsPass});
    declare("InternetGatewayDevice.ManagementServer.URL", {value: daily}, {value: url});
    declare("InternetGatewayDevice.ManagementServer.ConnectionRequestUsername", {value: daily}, {value: ConnReqUser});
    declare("InternetGatewayDevice.ManagementServer.ConnectionRequestPassword", {value: daily}, {value: ConnReqPass});
    declare("InternetGatewayDevice.ManagementServer.PeriodicInformEnable", {value: daily}, {value: true});
    declare("InternetGatewayDevice.ManagementServer.PeriodicInformInterval", {value: daily}, {value: informInterval});
} else {
    declare("Device.ManagementServer.Username", {value: daily}, {value: AcsUser});
    declare("Device.ManagementServer.Password", {value: daily}, {value: AcsPass});
    declare("Device.ManagementServer.URL", {value: daily}, {value: url});
    declare("Device.ManagementServer.ConnectionRequestUsername", {value: daily}, {value: ConnReqUser});
    declare("Device.ManagementServer.ConnectionRequestPassword", {value: daily}, {value: ConnReqPass});
    declare("Device.ManagementServer.PeriodicInformEnable", {value: daily}, {value: true});
    declare("Device.ManagementServer.PeriodicInformInterval", {value: daily}, {value: informInterval});
}
