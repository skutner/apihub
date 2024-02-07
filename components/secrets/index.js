const SecretsService = require("./SecretsService");
const httpUtils = require("../../libs/http-wrapper/src/httpUtils");

function secrets(server) {
    const logger = $$.getLogger("secrets", "apihub/secrets");
    const httpUtils = require("../../libs/http-wrapper/src/httpUtils");
    const constants = require("./constants");
    const SecretsService = require("./SecretsService");
    let secretsService;
    setTimeout(async ()=>{
      secretsService =  await SecretsService.getSecretsServiceInstanceAsync(server.rootFolder);
    })

    const containerIsReadonly = (containerName) => {
        const readonlyContainers = Object.values(constants.CONTAINERS);
        return readonlyContainers.includes(containerName);
    }
    const getSSOSecret = (request, response) => {
        let userId = request.headers["user-id"];
        let appName = request.params.appName;
        if(containerIsReadonly(appName)){
            response.statusCode = 403;
            response.end(`Container ${appName} is readonly`);
            return;
        }
        let secret;
        try {
            secret = secretsService.getSecretSync(appName, userId);
        } catch (e) {
            response.statusCode = e.code;
            response.end(e.message);
            return;
        }

        response.statusCode = 200;
        response.end(secret);
    }

    const putSSOSecret = async (request, response) => {
        let userId = request.headers["user-id"];
        let appName = request.params.appName;
        let secret;
        try {
            secret = JSON.parse(request.body).secret;
        } catch (e) {
            logger.error("Failed to parse body", request.body);
            response.statusCode = 500;
            response.end(e);
            return;
        }

        try {
            await secretsService.putSecretAsync(appName, userId, secret);
        } catch (e) {
            response.statusCode = e.code;
            response.end(e.message);
            return;
        }

        response.statusCode = 200;
        response.end();
    };

    const deleteSSOSecret = async (request, response) => {
        let appName = request.params.appName;
        let userId = request.headers["user-id"];

        try {
            await secretsService.deleteSecretAsync(appName, userId);
        } catch (e) {
            response.statusCode = e.code;
            response.end(e.message);
            return;
        }

        response.statusCode = 200;
        response.end();
    }

    const logEncryptionTest = () => {
        const key = "presetEncryptionKeyForInitialLog";
        const text = "TheQuickBrownFoxJumpedOverTheLazyDog";

        logger.info(0x500, "Recovery Passphrase Encryption Check\nPlain text: " + text);
        logger.info(0x500, "Preset encryption key: " + key);

        const filePath = require("path").join(server.rootFolder, "initialEncryptionTest");
        const encryptedText = require("opendsu").loadAPI("crypto").encrypt(text, key).toString("hex");

        logger.info(0x500, "Writing encrypted file on disk: " + filePath);
        logger.info(0x500, "Cipher text(file contents): " + encryptedText);

        require("fs").writeFile(filePath, encryptedText, (err) => {
            if (err) {
                logger.info(0x500, "Failed to write file: " + filePath + " Error: " + err);
            }
        });
    }

    async function putDIDSecret(req, res) {
        let {did, name} = req.params;
        let secret = req.body;
        try {
            await secretsService.putSecretAsync(name, did, secret);
        } catch (e) {
            res.statusCode = e.code;
            res.end(e.message);
            return;
        }
        res.statusCode = 200;
        res.end();
    }

    function getDIDSecret(req, res) {
        let {did, name} = req.params;
        if(containerIsReadonly(did)){
            res.statusCode = 403;
            res.end(`Container ${did} is readonly`);
            return;
        }
        let secret;
        try {
            secret = secretsService.getSecretSync(name, did);
            res.statusCode = 200;
        } catch (err) {
            res.statusCode = err.code;
            res.end(err.message);
            return;
        }
        res.end(secret);
    }

    async function deleteDIDSecret(req, res) {
        let {did, name} = req.params;
        try {
            await secretsService.deleteSecretAsync(name, did)
            res.statusCode = 200;
        } catch (err) {
            res.statusCode = err.code;
            res.end(err.message);
            return;
        }

        res.end();
    }

    logEncryptionTest();

    const senderIsAdmin = (req) => {
        const authorizationHeader = req.headers.authorization;
        if(!authorizationHeader) {
            return !!secretsService.apiKeysContainerIsEmpty();
        }

        return secretsService.isAdminAPIKey(authorizationHeader);
    }

    server.post("/apiKey/*", httpUtils.bodyParser);
    server.post("/apiKey/:keyId/:isAdmin", async (req, res) => {
        if(!senderIsAdmin(req)){
            res.statusCode = 403;
            res.end("Forbidden");
            return;
        }
        let {keyId, isAdmin} = req.params;
        const apiKey = await secretsService.generateAPIKeyAsync(keyId, isAdmin === "true")
        res.statusCode = 200;
        res.end(apiKey);
    });

    server.delete("/apiKey/:keyId", async (req, res) => {
        if(!senderIsAdmin(req)){
            res.statusCode = 403;
            res.end("Forbidden");
            return;
        }
        let {keyId} = req.params;
        await secretsService.deleteAPIKeyAsync(keyId);
        res.statusCode = 200;
        res.end();
    })

    server.put('/putSSOSecret/*', httpUtils.bodyParser);
    server.get("/getSSOSecret/:appName", getSSOSecret);
    server.put('/putSSOSecret/:appName', putSSOSecret);
    server.delete("/deactivateSSOSecret/:appName/:did", deleteSSOSecret);
    server.delete("/removeSSOSecret/:appName", deleteSSOSecret);

    server.put('/putDIDSecret/*', httpUtils.bodyParser);
    server.put('/putDIDSecret/:did/:name', putDIDSecret);
    server.get('/getDIDSecret/:did/:name', getDIDSecret);
    server.delete('/removeDIDSecret/:did/:name', deleteDIDSecret);
}

module.exports = secrets;
