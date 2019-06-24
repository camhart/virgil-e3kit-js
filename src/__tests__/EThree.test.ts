import { LookupResult, onEncryptProgressSnapshot, onDecryptProgressSnapshot } from './../types';
import {
    RegisterRequiredError,
    LookupNotFoundError,
    PrivateKeyAlreadyExistsError,
    IdentityAlreadyExistsError,
    WrongKeyknoxPasswordError,
    LookupError,
    DUPLICATE_IDENTITIES,
    PrivateKeyNoBackupError,
    EMPTY_ARRAY,
    IntegrityCheckFailedError,
} from '../errors';
import {
    generator,
    clear,
    createSyncStorage,
    keyStorage,
    cardManager,
    createFetchToken,
    virgilCrypto,
    initializeEThree,
    initializeETheeFromIdentity,
    readFile,
} from './utils.test';
import { IKeyEntry } from 'virgil-sdk';
import { getObjectValues } from '../utils/array';
import expect from 'expect';
import uuid from 'uuid/v4';
import { EThree } from '..';
import {
    VIRGIL_STREAM_SIGNING_STATE,
    VIRGIL_STREAM_ENCRYPTING_STATE,
    VIRGIL_STREAM_DECRYPTING_STATE,
    VIRGIL_STREAM_VERIFYING_STATE,
} from '../utils/constants';
import 'abort-controller/polyfill';

describe('EThree.register()', () => {
    before(clear);

    it('STA-9 has no local key, has no card', async () => {
        const identity = 'virgiltestlocalnokeynocard' + Date.now();
        const fetchToken = createFetchToken(identity);
        const prevCards = await cardManager.searchCards(identity);
        expect(prevCards.length).toBe(0);
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const [cards, key] = await Promise.all([
            cardManager.searchCards(identity),
            keyStorage.load(identity),
        ]);
        expect(cards.length).toBe(1);
        expect(key).not.toBe(null);
    });

    it('has local key, has no card', async () => {
        const identity = 'virgiltestlocal2' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        const keyPair = virgilCrypto.generateKeys();
        await keyStorage.save({
            name: identity,
            value: virgilCrypto.exportPrivateKey(keyPair.privateKey),
        });
        await sdk.register();
        const cards = await cardManager.searchCards(identity);
        expect(cards.length).toEqual(1);
    });

    it('STE-10 has card', async () => {
        const identity = 'virgiltestlocal3' + Date.now();
        const keyPair = virgilCrypto.generateKeys();
        await cardManager.publishCard({ identity: identity, ...keyPair });
        await keyStorage.save({
            name: identity,
            value: virgilCrypto.exportPrivateKey(keyPair.privateKey),
        });
        const fetchToken = createFetchToken(identity);
        const prevCards = await cardManager.searchCards(identity);

        expect(prevCards.length).toEqual(1);

        const sdk = await initializeEThree(fetchToken);
        try {
            await sdk.register();
        } catch (e) {
            expect(e).toBeInstanceOf(IdentityAlreadyExistsError);
        }
    });

    it('STE-11 call 2 times', async () => {
        const identity = 'virgiltestregister' + Date.now();
        const fetchToken = createFetchToken(identity);
        const prevCards = await cardManager.searchCards(identity);
        expect(prevCards.length).toBe(0);
        const sdk = await initializeEThree(fetchToken);
        const promise = sdk.register();
        try {
            await sdk.register();
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
        await promise;
        const [cards, key] = await Promise.all([
            cardManager.searchCards(identity),
            keyStorage.load(identity),
        ]);
        expect(cards.length).toBe(1);
        expect(key).not.toBe(null);
    });
});

describe('EThree.rotatePrivateKey', () => {
    before(clear);

    it('STE-14 has card', async () => {
        const identity = 'virgiltestrotate1' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        const keypair = virgilCrypto.generateKeys();
        const prevCard = await cardManager.publishCard({ identity: identity, ...keypair });
        await sdk.rotatePrivateKey();
        const newCards = await cardManager.searchCards(identity);
        expect(newCards.length).toBe(1);
        expect(newCards[0].previousCardId).toBe(prevCard.id);
    });

    it('STE-12 has no card', async () => {
        const identity = 'virgiltestrotate2' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        const cards = await cardManager.searchCards(identity);
        expect(cards.length).toEqual(0);
        try {
            await sdk.rotatePrivateKey();
        } catch (e) {
            expect(e).toBeInstanceOf(RegisterRequiredError);

            return;
        }
        throw 'should throw';
    });

    it('STE-10 rotate 2 times', async () => {
        const identity = 'virgiltestrotate3' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const cards = await cardManager.searchCards(identity);
        expect(cards.length).toEqual(1);
        await sdk.cleanup();
        const promise = sdk.rotatePrivateKey();
        try {
            await sdk.rotatePrivateKey();
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
        await promise;
        const newCards = await cardManager.searchCards(identity);
        expect(newCards.length).toBe(1);
        expect(newCards[0].previousCardId).toBe(cards[0].id);
    });
});

describe('lookupPublicKeys', () => {
    before(clear);

    it('lookupPublicKeys for one identity success', async () => {
        const identity1 = 'virgiltestlookup1' + Date.now();
        const identity2 = 'virgiltestlookup2' + Date.now();
        const fetchToken = createFetchToken(identity1);
        const sdk = await initializeEThree(fetchToken);
        const keypair = virgilCrypto.generateKeys();
        await cardManager.publishCard({ identity: identity2, ...keypair });
        const lookupResult = await sdk.lookupPublicKeys(identity2);

        expect(Array.isArray(lookupResult)).not.toBeTruthy();
        expect(virgilCrypto.exportPublicKey(lookupResult).toString('base64')).toEqual(
            virgilCrypto.exportPublicKey(keypair.publicKey).toString('base64'),
        );
    });

    it('STE-1 lookupKeys success', async () => {
        const identity = 'virgiltestlookup' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        const identity1 = 'virgiltestlookup1' + Date.now();
        const identity2 = 'virgiltestlookup2' + Date.now();
        const keypair1 = virgilCrypto.generateKeys();
        const keypair2 = virgilCrypto.generateKeys();

        await Promise.all([
            cardManager.publishCard({ identity: identity1, ...keypair1 }),
            cardManager.publishCard({ identity: identity2, ...keypair2 }),
        ]);
        const publicKeys = await sdk.lookupPublicKeys([identity1, identity2]);

        expect(getObjectValues(publicKeys).length).toBe(2);
        expect(virgilCrypto.exportPublicKey(publicKeys[identity1]).toString('base64')).toEqual(
            virgilCrypto.exportPublicKey(keypair1.publicKey).toString('base64'),
        );
        expect(virgilCrypto.exportPublicKey(publicKeys[identity2]).toString('base64')).toEqual(
            virgilCrypto.exportPublicKey(keypair2.publicKey).toString('base64'),
        );
    });

    it('STE-2 lookupKeys nonexistent identity', async () => {
        const identity = 'virgiltestlookup' + Date.now();
        const fetchToken = createFetchToken(identity);
        const sdk = await initializeEThree(fetchToken);
        const identity1 = 'virgiltestlookupnonexist1' + Date.now();
        const identity2 = 'virgiltestlookupnonexist2' + Date.now();
        try {
            await sdk.lookupPublicKeys([identity1, identity2]);
        } catch (e) {
            expect(e).toBeInstanceOf(LookupError);
            if (e instanceof LookupError) {
                expect(e.lookupResult[identity1]).toBeInstanceOf(LookupNotFoundError);
                expect(e.lookupResult[identity2]).toBeInstanceOf(LookupNotFoundError);
            }
            return;
        }

        throw 'should throw';
    });

    it('STE-2 lookupKeys with empty array of identities', async () => {
        const identity = 'virgiltestlookup' + Date.now();
        const fetchToken = createFetchToken(identity);

        const sdk = await initializeEThree(fetchToken);
        try {
            await sdk.lookupPublicKeys([]);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect(e.message).toEqual(EMPTY_ARRAY);
            return;
        }
        throw 'should throw';
    });

    it('lookupKeys with duplicate identites', async () => {
        const identity = 'virgiltestlookup' + Date.now();
        const fetchToken = createFetchToken(identity);

        const sdk = await initializeEThree(fetchToken);
        try {
            await sdk.lookupPublicKeys([identity, identity, 'random']);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
            expect(e.message).toEqual(DUPLICATE_IDENTITIES);
            return;
        }
        throw 'should throw';
    });
});

describe('change password', () => {
    before(clear);
    it('should change password', async () => {
        const identity = 'virgiltest' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const oldPwd = 'old_password';
        const newPwd = 'new_password';
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        await sdk.backupPrivateKey(oldPwd);
        await sdk.cleanup();
        await sdk.changePassword(oldPwd, newPwd);
        await sdk.restorePrivateKey(newPwd);
        const hasKey = await sdk.hasLocalPrivateKey();
        expect(hasKey).toEqual(true);
    });

    it('wrong old password', async () => {
        const identity = 'virgiltest' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const oldPwd = 'old_password';
        const newPwd = 'new_password';
        const wrongPwd = 'wrong_password';
        try {
            const sdk = await initializeEThree(fetchToken);
            await sdk.register();
            await sdk.backupPrivateKey(oldPwd);
            await sdk.changePassword(wrongPwd, newPwd);
        } catch (e) {
            expect(e).toBeInstanceOf(WrongKeyknoxPasswordError);
            return;
        }
        throw 'should throw';
    });
});

describe('backupPrivateKey', () => {
    it('success', async () => {
        const identity = 'virgiltestbackup1' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const pwd = 'secret_password';
        const sdk = await initializeEThree(fetchToken);
        const storage = await createSyncStorage(identity, pwd);

        try {
            storage.retrieveEntry(identity);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }

        try {
            await sdk.register();
            await sdk.backupPrivateKey(pwd);
        } catch (e) {
            expect(e).not.toBeDefined();
        }
        await storage.retrieveCloudEntries();
        const key = storage.retrieveEntry(identity);
        expect(key).not.toBeNull();
    });

    it('No local private key', async () => {
        const identity = 'virgiltestbackup2' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);
        try {
            await sdk.backupPrivateKey('secret_pass');
        } catch (e) {
            expect(e).toBeInstanceOf(RegisterRequiredError);
            return;
        }
        throw 'should throw';
    });
});

describe('restorePrivateKey', () => {
    before(clear);
    it('has no private key', async () => {
        const pwd = 'secret_password';
        const identity = 'virgiltestrestore1' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        const storage = await createSyncStorage(identity, pwd);

        try {
            storage.retrieveEntry(identity);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
        let privateKey: IKeyEntry | null;
        try {
            await sdk.register();
            privateKey = await keyStorage.load(identity);
            await sdk.backupPrivateKey(pwd);
            await sdk.cleanup();
        } catch (e) {
            expect(e).not.toBeDefined();
        }
        const noPrivateKey = await keyStorage.load(identity);
        expect(noPrivateKey).toBeFalsy();
        await sdk.restorePrivateKey(pwd);
        const restoredPrivateKey = await keyStorage.load(identity);
        expect(restoredPrivateKey!.value.toString('base64')).toEqual(
            privateKey!.value.toString('base64'),
        );
    });

    it('has private key', async () => {
        const pwd = 'secret_password';
        const identity = 'virgiltestrestore1' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        const storage = await createSyncStorage(identity, pwd);

        try {
            storage.retrieveEntry(identity);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
        try {
            await sdk.register();
            await sdk.backupPrivateKey(pwd);
        } catch (e) {
            expect(e).not.toBeDefined();
        }

        const noPrivateKey = await keyStorage.load(identity);
        expect(noPrivateKey).toBeTruthy();
        try {
            await sdk.restorePrivateKey(pwd);
        } catch (e) {
            expect(e).toBeInstanceOf(PrivateKeyAlreadyExistsError);

            return;
        }
        throw 'should throw';
    });
});

describe('encrypt and decrypt', () => {
    before(clear);

    it('STE-3 ', async () => {
        const identity1 = 'virgiltestencrypt1' + Date.now();
        const identity2 = 'virgiltestencrypt2' + Date.now();

        const fetchToken1 = () => Promise.resolve(generator.generateToken(identity1).toString());
        const fetchToken2 = () => Promise.resolve(generator.generateToken(identity2).toString());

        const [sdk1, sdk2] = await Promise.all([
            initializeEThree(fetchToken1),
            initializeEThree(fetchToken2),
        ]);

        await Promise.all([sdk1.register(), sdk2.register()]);
        const message = 'encrypt, decrypt, repeat';
        const sdk1PublicKeys = await sdk1.lookupPublicKeys([identity1]);
        const sdk2PublicKeys = await sdk2.lookupPublicKeys([identity1, identity2]);
        const encryptedMessage = await sdk1.encrypt(message, sdk2PublicKeys);
        try {
            await sdk2.decrypt(encryptedMessage);
        } catch (e) {
            expect(e).toBeInstanceOf(Error);
        }
        const decryptedMessage = await sdk2.decrypt(encryptedMessage, sdk1PublicKeys[identity1]);
        expect(decryptedMessage).toEqual(message);
    });

    it('STE-5 encrypt for one public key', async () => {
        const identity = 'virgiltestencrypt' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        const { publicKey } = virgilCrypto.generateKeys();
        await sdk.register();
        try {
            await sdk.encrypt('privet', publicKey);
        } catch (e) {
            expect(e).not.toBeDefined();
        }
    });

    it('STE-6 encrypt and decrypt without public keys', async () => {
        const identity = 'virgiltestencrypt' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const message = 'secret message';
        const encryptedMessage = await sdk.encrypt(message);
        const decryptedMessage = await sdk.decrypt(encryptedMessage);
        expect(decryptedMessage).toEqual(message);
    });

    it('STE-7 decrypt message without sign', async () => {
        const identity = 'virgiltestencrypt' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const receiverPublicKey = await sdk.lookupPublicKeys([identity]);
        const { publicKey: senderPublicKey } = virgilCrypto.generateKeys();
        const message = 'encrypted, but not signed :)';
        const encryptedMessage = await virgilCrypto
            .encrypt(message, receiverPublicKey[identity])
            .toString('base64');
        try {
            await sdk.decrypt(encryptedMessage, senderPublicKey);
        } catch (e) {
            expect(e).toBeDefined();

            return;
        }
        throw 'should throw';
    });

    it('STE-8 no decrypt/encrypt before register', async () => {
        const identity = 'virgiltestencrypt' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        await keyStorage.clear();
        const sdk = await initializeEThree(fetchToken);
        try {
            await sdk.encrypt('message');
        } catch (e) {
            expect(e).toBeInstanceOf(RegisterRequiredError);
        }
        try {
            await sdk.decrypt('message');
        } catch (e) {
            expect(e).toBeInstanceOf(RegisterRequiredError);
        }
    });

    it('should return buffer', async () => {
        const identity = 'virgiltestencryptbuffer' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const buf = new ArrayBuffer(32);

        const recipient = virgilCrypto.generateKeys();
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const publicKey = (await sdk.lookupPublicKeys([identity]))[0];
        const encryptedMessage = await sdk.encrypt(buf, recipient.publicKey);
        expect(Buffer.isBuffer(encryptedMessage)).toBe(true);

        const resp = await sdk.decrypt(encryptedMessage, publicKey);
        expect(Buffer.isBuffer(resp)).toBe(true);
    });
});

describe('cleanup()', () => {
    before(clear);
    it('local and remote key exists', async () => {
        const identity = 'virgiltestlogout' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());

        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        await sdk.cleanup();
        const privateKeyFromLocalStorage = await keyStorage.load(identity);
        expect(privateKeyFromLocalStorage).toEqual(null);
    });
});

describe('resetPrivateKeyBackup(pwd?)', () => {
    it('reset backup private key', async () => {
        const pwd = 'secure_password';
        const identity = 'virgiltestlogout1' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const cloudStorage = await createSyncStorage(identity, pwd);
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        await sdk.backupPrivateKey(pwd);

        try {
            await sdk.resetPrivateKeyBackup(pwd);
        } catch (e) {
            expect(e).not.toBeDefined();
        }

        try {
            await cloudStorage.retrieveEntry(identity);
        } catch (e) {
            expect(e).toBeTruthy();
        }
    });

    it('reset backup private key when no backup', async () => {
        const pwd = 'secure_password';
        const identity = 'virgiltestlogout2' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();

        try {
            await sdk.resetPrivateKeyBackup(pwd);
        } catch (e) {
            expect(e).toBeInstanceOf(PrivateKeyNoBackupError);

            return;
        }
        throw 'should throw';
    });

    it('reset backup private without password', async () => {
        expect.assertions(2);
        const pwd = 'secure_password';
        const identity = 'virgiltestlogout2' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        await sdk.backupPrivateKey(pwd);
        const cloudStorage = await createSyncStorage(identity, pwd);
        let isExisting = cloudStorage.existsEntry(identity);
        expect(isExisting).toBe(true);
        await sdk.resetPrivateKeyBackup();
        await cloudStorage.retrieveCloudEntries();
        isExisting = cloudStorage.existsEntry(identity);
        expect(isExisting).toBe(false);
    });
});

describe('hasPrivateKey()', () => {
    it('has private key', async () => {
        const identity = 'virgiltesthasprivatekey1' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);
        await sdk.register();
        const hasPrivateKey = await sdk.hasLocalPrivateKey();
        expect(hasPrivateKey).toEqual(true);

        return;
    });

    it('has no private key', async () => {
        const identity = 'virgiltesthasprivatekey2' + Date.now();
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);
        const hasPrivateKey = await sdk.hasLocalPrivateKey();
        expect(hasPrivateKey).toEqual(false);

        return;
    });
});

describe('EThree.encryptFile/EThree.decryptFile', async () => {
    const identity1 = uuid();
    const identity2 = uuid();
    const identity3 = uuid();

    let sdk1: EThree, sdk2: EThree, sdk3: EThree, lookupResult: LookupResult;

    const originString = 'foo'.repeat(1024 * 3);

    const originFile = new File([originString], 'foo.txt', {
        type: 'text/plain',
    });

    before(async () => {
        [sdk1, sdk2, sdk3] = await Promise.all([
            initializeETheeFromIdentity(identity1),
            initializeETheeFromIdentity(identity2),
            initializeETheeFromIdentity(identity3),
        ]);

        await Promise.all([sdk1.register(), sdk2.register(), sdk3.register()]);
        lookupResult = await sdk1.lookupPublicKeys([identity1, identity2, identity3]);
    });

    it('should decrypt file for one public key', async () => {
        const [publicKey2, publicKey1] = await Promise.all([
            sdk1.lookupPublicKeys(identity2),
            sdk2.lookupPublicKeys(identity1),
        ]);

        const encryptedFile = await sdk1.encryptFile(originFile, publicKey2);
        const decryptedFile = await sdk2.decryptFile(encryptedFile, publicKey1);

        const decryptedString = await readFile(decryptedFile);

        expect(originString).toEqual(decryptedString);
    });

    it('should encrypt for multiple keys', async () => {
        const onlyTwoKeys = await sdk1.lookupPublicKeys([identity1, identity2]);
        const encryptedFile = await sdk1.encryptFile(originFile, onlyTwoKeys);
        const decryptedFile = await sdk2.decryptFile(encryptedFile, onlyTwoKeys[identity1]);

        const decryptedString = await readFile(decryptedFile);

        expect(originString).toBe(decryptedString);

        try {
            await sdk3.decryptFile(encryptedFile, onlyTwoKeys[identity1]);
        } catch (e) {
            return expect(e).toBeInstanceOf(Error);
        }

        throw new Error('should throw');
    });

    it('should take input as string, file or blob', async () => {
        const keypair = virgilCrypto.generateKeys();

        const originBlob = new Blob(['foo'], {
            type: 'text/plain',
        });

        const encryptedFile = await sdk1.encryptFile(originFile, keypair.publicKey);
        const encryptedBlob = await sdk1.encryptFile(originBlob, keypair.publicKey);

        expect(encryptedFile).toBeInstanceOf(File);
        expect(encryptedBlob).toBeInstanceOf(Blob);
        expect(encryptedBlob).not.toBeInstanceOf(File);
    });

    it('should process different chunks of data', async () => {
        const encryptedSnapshots: onEncryptProgressSnapshot[] = [];

        const originString = 'foo';

        const originFile = new File([originString], 'foo.txt', {
            type: 'text/plain',
        });

        expect(originFile.size).toBe(3);

        const encryptedFile = await sdk1.encryptFile(originFile, lookupResult[identity2], {
            chunkSize: 2,
            onProgress: encryptedSnapshots.push.bind(encryptedSnapshots),
        });

        expect(encryptedSnapshots.length).toEqual(4);
        expect(encryptedSnapshots[0]).toMatchObject({
            fileSize: originFile.size,
            bytesProcessed: 2,
            state: VIRGIL_STREAM_SIGNING_STATE,
        });
        expect(encryptedSnapshots[1]).toMatchObject({
            fileSize: originFile.size,
            bytesProcessed: 3,
            state: VIRGIL_STREAM_SIGNING_STATE,
        });
        expect(encryptedSnapshots[2]).toMatchObject({
            fileSize: originFile.size,
            bytesProcessed: 2,
            state: VIRGIL_STREAM_ENCRYPTING_STATE,
        });
        expect(encryptedSnapshots[3]).toMatchObject({
            fileSize: originFile.size,
            bytesProcessed: 3,
            state: VIRGIL_STREAM_ENCRYPTING_STATE,
        });

        const decryptedSnapshots: onDecryptProgressSnapshot[] = [];

        await sdk2.decryptFile(encryptedFile, lookupResult[identity1], {
            chunkSize: Math.ceil(encryptedFile.size / 2),
            onProgress: decryptedSnapshots.push.bind(decryptedSnapshots),
        });

        expect(decryptedSnapshots.length).toEqual(3);
        expect(decryptedSnapshots[0]).toMatchObject({
            fileSize: encryptedFile.size,
            bytesProcessed: Math.ceil(encryptedFile.size / 2),
            state: VIRGIL_STREAM_DECRYPTING_STATE,
        });
        expect(decryptedSnapshots[1]).toMatchObject({
            fileSize: encryptedFile.size,
            bytesProcessed: encryptedFile.size,
            state: VIRGIL_STREAM_DECRYPTING_STATE,
        });
        expect(decryptedSnapshots[2]).toMatchObject({
            fileSize: originFile.size,
            bytesProcessed: originFile.size,
            state: VIRGIL_STREAM_VERIFYING_STATE,
        });
    });

    it('should abort encryptFile', async () => {
        const encryptAbort = new AbortController();
        const decryptAbort = new AbortController();

        const encryptPromise = sdk1.encryptFile(originFile, lookupResult[identity2]);
        const encryptAbortedPromise = sdk1.encryptFile(originFile, lookupResult[identity2], {
            chunkSize: 1,
            signal: encryptAbort.signal,
        });

        encryptAbort.abort();

        try {
            await encryptAbortedPromise;
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
        }
        try {
            await sdk1.decryptFile(await encryptPromise, lookupResult[identity1], {
                chunkSize: Math.floor(originFile.size / 3),
                signal: decryptAbort.signal,
                onProgress: decryptAbort.abort,
            });
        } catch (err) {
            expect(err).toBeInstanceOf(Error);
            return;
        }

        throw new Error('should throw');
    });

    it('should verify the signature', async () => {
        const receiverPublicKey = await sdk1.lookupPublicKeys(identity2);
        const encryptedFile = await sdk1.encryptFile(originFile, receiverPublicKey);
        try {
            await sdk2.decryptFile(encryptedFile);
        } catch (err) {
            expect(err).toBeInstanceOf(IntegrityCheckFailedError);
            return;
        }
        throw new Error('should throw');
    });
});

describe('unregister()', () => {
    it('STE-20 revokes Virgil Card and deletes private key', async () => {
        const identity = `virgiltest_unregister_${Date.now()}`;
        const fetchToken = () => Promise.resolve(generator.generateToken(identity).toString());
        const sdk = await initializeEThree(fetchToken);

        await expect(sdk.unregister()).rejects.toBeInstanceOf(RegisterRequiredError);

        await sdk.register();
        await sdk.unregister();

        const [cards, key] = await Promise.all([
            cardManager.searchCards(identity),
            keyStorage.load(identity),
        ]);
        expect(cards).toHaveLength(0);
        expect(key).toBe(null);
    });
});