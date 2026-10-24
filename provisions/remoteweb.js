// ==================== INIT ====================
const hourly = Date.now() - 3590000;
const merk = declare('DeviceID.Manufacturer', {value: 1}).value[0];
const tipe = declare('DeviceID.ProductClass', {value: 1}).value[0];

// Detect vendor
const hw_sn = declare('InternetGatewayDevice.DeviceInfo.X_HW_SerialNumber', {value: hourly});
const fh = declare('InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower', {value: hourly});

// ==================== HUAWEI ====================
if (hw_sn.size) {

    // Enable web access
    declare("InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.1.Enable", {value: hourly}, {value: true});
    declare("InternetGatewayDevice.UserInterface.X_HW_WebUserInfo.2.Enable", {value: hourly}, {value: true});

    // Enable WAN services
    declare("InternetGatewayDevice.X_HW_Security.AclServices.SSHWanEnable", {value: hourly}, {value: true});
    declare("InternetGatewayDevice.X_HW_Security.AclServices.HTTPWanEnable", {value: hourly}, {value: true});
    declare("InternetGatewayDevice.X_HW_Security.AclServices.TELNETWanEnable", {value: hourly}, {value: true});

    // Firewall handling
    const is8245H5 = (tipe.indexOf('8245H5') !== -1);
    declare("InternetGatewayDevice.X_HW_Security.X_HW_FirewallLevel", {value: hourly}, {value: is8245H5 ? "User-defined" : "Disabled"});
    declare("InternetGatewayDevice.X_HW_Security.Dosfilter.IcmpEchoReplyEn", {value: hourly}, {value: "0"});

    // ==================== DYNAMIC WAN DETECTION ====================
    let detectedWans = [];

    for (let i = 1; i <= 8; i++) {

        // IP WAN
        let ipAddr = declare(`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANIPConnection.1.ExternalIPAddress`, {value: 1});
        if (ipAddr.size && ipAddr.value[0] && ipAddr.value[0] !== "0.0.0.0") {
            detectedWans.push(`wan1.${i}.ip1`);
        }

        // PPP WAN
        let pppAddr = declare(`InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${i}.WANPPPConnection.1.ExternalIPAddress`, {value: 1});
        if (pppAddr.size && pppAddr.value[0] && pppAddr.value[0] !== "0.0.0.0") {
            detectedWans.push(`wan1.${i}.ppp1`);
        }
    }

    // pilih WAN terbaik (prioritas pertama)
    const selectedWan = detectedWans.length ? detectedWans[0] : null;

    // ==================== WAN ACCESS CONTROL ====================
    const skipModels = ['EG8041V5', 'HS8145C5', 'EG8141A5', 'HG8245H5', 'HG8145V5'];
    const skipWanAccess = skipModels.some(model => tipe.indexOf(model) !== -1);

    const wa1 = declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.WanName", {value: 1});
    const wa2 = declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.2.WanName", {value: 1});

    // ⚠️ IMPORTANT:
    // HG8145V5 → jangan force set kalau tidak perlu (hindari 9002)
    if (selectedWan && wa1.size && !skipWanAccess) {

        // hanya set jika berbeda
        if (wa1.value[0] !== selectedWan) {
            declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.Enable", {value: hourly}, {value: "1"});
            declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.Protocol", {value: hourly}, {value: "HTTP"});
            declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.WanName", {value: hourly}, {value: selectedWan});
        }

        // optional WAN kedua (backup)
        if (wa2.size && detectedWans.length > 1) {
            if (wa2.value[0] !== detectedWans[1]) {
                declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.2.Enable", {value: hourly}, {value: "1"});
                declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.2.Protocol", {value: hourly}, {value: "HTTP"});
                declare("InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.2.WanName", {value: hourly}, {value: detectedWans[1]});
            }
        }
    }
}

// ==================== FIBERHOME ====================
if (fh.size) {
    declare("InternetGatewayDevice.X_FH_FireWall.REMOTEACCEnable", {value: hourly}, {value: true});
    declare("InternetGatewayDevice.X_FH_Remoteweblogin.webloginenable", {value: hourly}, {value: "1"});
    // HG6045F3 firmware RP3441: saklar remote web terpisah (tidak ada di RP3440)
    declare("InternetGatewayDevice.UserInterface.X_FH_WebUserInfo.RemoteAccess", {value: hourly}, {value: "1"});

    declare("InternetGatewayDevice.X_FH_ACL.Enable", {value: hourly}, {value: "1"});
    declare("InternetGatewayDevice.X_FH_ACL.Rule.1.Direction", {value: hourly}, {value: "1"});
    declare("InternetGatewayDevice.X_FH_ACL.Rule.1.Enable", {value: hourly}, {value: "1"});
    declare("InternetGatewayDevice.X_FH_ACL.Rule.1.Protocol", {value: hourly}, {value: "ALL"});

    // Web dari WAN butuh dua aturan ACL (Direction 1 dan 0), seperti di unit yang sudah bisa diakses.
    // Buat aturan yang belum ada; aturan yang sudah ada tidak diubah.
    const fhRule = "InternetGatewayDevice.X_FH_ACL.Rule";
    if (declare("InternetGatewayDevice.X_FH_ACL", {path: hourly}).size) {
        declare(fhRule + ".[Direction:1]", {path: hourly}, {path: 1});
        declare(fhRule + ".[Direction:0]", {path: hourly}, {path: 1});
        declare(fhRule + ".[Direction:0].Enable", {value: hourly}, {value: 1});
        declare(fhRule + ".[Direction:0].Protocol", {value: hourly}, {value: "ALL"});
    }
}

// ==================== CMCC ====================
const xcmc = declare('InternetGatewayDevice.X_CMCC_UserInfo.ServiceName', {value: hourly});
if (xcmc.size) {
    declare("InternetGatewayDevice.X_CMCC_Security.FirewallEnable", {value: hourly}, {value: "FALSE"});
    declare("InternetGatewayDevice.X_CMCC_Security.FirewallLevel", {value: hourly}, {value: "0"});
}

// ==================== ZTE ====================
if (merk === 'ZTE') {
    declare("InternetGatewayDevice.Firewall.Enable", {value: hourly}, {value: false});
    declare("InternetGatewayDevice.Firewall.Config", {value: hourly}, {value: "Low"});

    declare("InternetGatewayDevice.Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl.1.Enable", {value: hourly}, {value: true});
    declare("InternetGatewayDevice.Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl.1.Mode", {value: hourly}, {value: "Accept"});
    declare("InternetGatewayDevice.Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl.1.Ingress", {value: hourly}, {value: "WAN_ALL"});
    declare("InternetGatewayDevice.Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl.1.ServiceType", {value: hourly}, {value: "HTTP"});

    // Sebagian F670L punya tabel IPV4ServiceControl tapi kosong, sehingga baris .1 di atas tidak berefek.
    // Buat satu aturan HTTP dari WAN kalau belum ada; ONT tanpa tabel ini (F609, F663, F677) dilewati.
    const zteSc = "InternetGatewayDevice.Firewall.X_ZTE-COM_ServiceControl.IPV4ServiceControl";
    if (declare(zteSc, {path: hourly}).size) {
        declare(zteSc + ".[ServiceType:HTTP,Ingress:WAN_ALL]", {path: hourly}, {path: 1});
    }
}

// ==================== NOKIA / ALCATEL (ALCL) ====================
// Buka akses web GUI (HTTP + HTTPS) dari IP WAN. Tr69Disabled sengaja tidak disentuh.
if (merk === 'ALCL') {
    const wanTypes = ["WANIPConnection", "WANPPPConnection"];
    for (let t of wanTypes) {
        const base = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.*.${t}.*.X_ALU-COM_WanAccessCfg`;
        declare(`${base}.HttpDisabled`, {value: hourly}, {value: false});
        declare(`${base}.HttpsDisabled`, {value: hourly}, {value: false});
    }
}
