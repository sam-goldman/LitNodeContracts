const { expect } = require("chai");
const { ipfsIdToIpfsIdHash, getBytes32FromMultihash } = require("../utils.js");
const { smock } = require("@defi-wonderland/smock");

describe("PubkeyRouterAndPermissions", function () {
  let deployer;
  let signers;
  let routerContract;
  let pkpContract;
  let stakingContract;
  let tokenContract;

  before(async () => {
    const RouterContractFactory = await ethers.getContractFactory(
      "PubkeyRouterAndPermissions"
    );
    const PKPContractFactory = await ethers.getContractFactory("PKPNFT");
    // mock the staking contract so we can get it into the state we need
    const StakingContractFactory = await smock.mock("Staking");
    const TokenContractFactory = await ethers.getContractFactory("LITToken");

    [deployer, ...signers] = await ethers.getSigners();

    pkpContract = await PKPContractFactory.deploy();
    routerContract = await RouterContractFactory.deploy(pkpContract.address);
    tokenContract = await TokenContractFactory.deploy();

    await pkpContract.setRouterAddress(routerContract.address);

    stakingContract = await StakingContractFactory.deploy(
      tokenContract.address
    );

    stakingContract.isActiveValidator.returns(true);
    stakingContract.validatorCountForConsensus.returns(0);
  });

  describe("store and retrieve routing data", async () => {
    let fakePubkey =
      "0x83709b8bcc865ce02b7a918909936c8fbc3520445634dcaf4a18cfa1f0218a5ca37173aa265defedad866a0ae7b6c301";

    context("when routing data is unset", async () => {
      beforeEach(async () => {
        routerContract = routerContract.connect(deployer);
      });

      it("retrieves empty routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [keyPart1, keyPart2, keyLength, stakingContract, keyType] =
          await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContract).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);
      });
    });

    context("when routing data is set", async () => {
      beforeEach(async () => {
        routerContract = await routerContract.connect(deployer);
        pkpContract = await pkpContract.connect(deployer);
      });

      it("sets and retrieves routing data", async () => {
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);

        // validate that it's unset
        const [
          keyPart1,
          keyPart2,
          keyLength,
          stakingContractAddressBefore,
          keyType,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContractAddressBefore).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        // set routing data
        const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(fakePubkey, 32),
          32
        );

        // console.log("full key: ", fakePubkey);

        // console.log("keyPart1Bytes", keyPart1Bytes);
        // console.log("keyPart2Bytes", keyPart2Bytes);

        // console.log(
        //   "packed with zeros stripped: ",
        //   ethers.utils.solidityPack(
        //     ["bytes32", "bytes"],
        //     [keyPart1Bytes, ethers.utils.hexStripZeros(keyPart2Bytes)]
        //   )
        // );

        const keyLengthInput = 48;
        const keyTypeInput = 1;

        await routerContract.voteForRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContract.address,
          keyTypeInput
        );

        // validate that it was set
        const [
          keyPart1After,
          keyPart2After,
          keyLengthAfter,
          stakingContractAddressAfter,
          keyTypeAfter,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAddressAfter).equal(stakingContract.address);
        expect(keyTypeAfter).equal(keyTypeInput);
      });
    });
  });

  describe("register a PKP and set routing permissions", async () => {
    context("when the PKP grants permission to an ETH address", async () => {
      // 64 byte pubkey - the max size we support
      let fakePubkey =
        "0x54497d637068d190a9c4dacd92a0a49f0a6a1f30c5a7a5aecc939fce644ff4e6006d3bf73dbd671efbbcab075e6f2500ad69aa9ed1f517e256473b18e05d396d";
      let tester;
      let creator;
      let tokenId;

      before(async () => {
        [creator, tester, ...signers] = signers;

        routerContract = await routerContract.connect(deployer);

        // check that the routing data for this pubkey is empty
        const pubkeyHash = ethers.utils.keccak256(fakePubkey);
        const [
          keyPart1,
          keyPart2,
          keyLength,
          stakingContractAddressBefore,
          keyType,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyPart2).equal(
          "0x0000000000000000000000000000000000000000000000000000000000000000"
        );
        expect(keyLength).equal(0);
        expect(stakingContractAddressBefore).equal(
          "0x0000000000000000000000000000000000000000"
        );
        expect(keyType).equal(0);

        const keyPart1Bytes = ethers.utils.hexDataSlice(fakePubkey, 0, 32);
        const keyPart2Bytes = ethers.utils.hexZeroPad(
          ethers.utils.hexDataSlice(fakePubkey, 32),
          32
        );

        const keyLengthInput = 64;
        const keyTypeInput = 2;

        await routerContract.voteForRoutingData(
          pubkeyHash,
          keyPart1Bytes,
          keyPart2Bytes,
          keyLengthInput,
          stakingContract.address,
          keyTypeInput
        );

        // validate that it was set
        const [
          keyPart1After,
          keyPart2After,
          keyLengthAfter,
          stakingContractAddressAfter,
          keyTypeAfter,
        ] = await routerContract.getRoutingData(pubkeyHash);
        expect(keyPart1After).equal(keyPart1Bytes);
        expect(keyPart2After).equal(keyPart2Bytes);
        expect(keyLengthAfter).equal(keyLengthInput);
        expect(stakingContractAddressAfter).equal(stakingContract.address);
        expect(keyTypeAfter).equal(keyTypeInput);

        tokenId = ethers.BigNumber.from(pubkeyHash);

        // mint the PKP to the tester account
        pkpContract = await pkpContract.connect(tester);
        // send eth with the txn
        const mintCost = await pkpContract.mintCost();
        const transaction = {
          value: mintCost,
        };
        await pkpContract.mintNext(2, transaction);
        const owner = await pkpContract.ownerOf(pubkeyHash);
        expect(owner).equal(tester.address);
      });

      it("grants permission to an eth address and then revokes it", async () => {
        const addressToPermit = "0x75EdCdfb5A678290A8654979703bdb75C683B3dD";

        pkpContract = await pkpContract.connect(tester);

        // validate that the address is not permitted
        let permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(false);

        // permit it
        routerContract = await routerContract.connect(tester);
        await routerContract.addPermittedAddress(tokenId, addressToPermit);
        permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAddress(tokenId, addressToPermit);
        permitted = await routerContract.isPermittedAddress(
          tokenId,
          addressToPermit
        );
        expect(permitted).equal(false);
      });

      it("grants permission to an IPFS id and then revokes it", async () => {
        const ipfsIdToPermit = "QmPRjq7medLpjnFSZaiJ3xUudKteVFQDmaMZuhr644MQ4Z";
        const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);

        pkpContract = await pkpContract.connect(tester);

        // validate that the ipfs ID is not permitted
        let permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdHash
        );
        expect(permitted).equal(false);

        // attempt to permit it
        routerContract = await routerContract.connect(tester);
        expect(
          routerContract.addPermittedAction(tokenId, ipfsIdHash)
        ).revertedWith(
          "Please register your Lit Action IPFS ID with the registerAction() function before permitting it to use a PKP"
        );
        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(false);

        // register the lit action
        let registered = await routerContract.isActionRegistered(ipfsIdHash);
        expect(registered).equal(false);
        const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
        await routerContract.registerAction(
          multihashStruct.digest,
          multihashStruct.hashFunction,
          multihashStruct.size
        );
        registered = await routerContract.isActionRegistered(ipfsIdHash);
        expect(registered).equal(true);

        // permit it
        routerContract = await routerContract.connect(tester);
        await routerContract.addPermittedAction(tokenId, ipfsIdHash);
        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAction(tokenId, ipfsIdHash);
        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(false);
      });

      it("checks the PKP eth address", async () => {
        // validate that the address matches what ethers calculates
        const pubkeyWithPrefix = "0x04" + fakePubkey.substring(2);
        console.log("pubkeyWithPrefix", pubkeyWithPrefix);
        const ethersResult = ethers.utils.computeAddress(pubkeyWithPrefix);
        const fullPubkey = await routerContract.getFullPubkey(tokenId);
        console.log("fullPubkey", fullPubkey);
        let ethAddressOfPKP = await routerContract.getEthAddress(tokenId);
        expect(ethAddressOfPKP).equal(ethersResult);
        const ecdsaPubkeyWithPrefix = await routerContract.getEcdsaPubkey(
          tokenId
        );
        expect(pubkeyWithPrefix).equal(ecdsaPubkeyWithPrefix);
      });

      it("registers and grants permission to an IPFS id and then revokes it", async () => {
        const ipfsIdToPermit = "QmNc6gpdFBq1dF1imq5xhHQPmbWuL7ScGXChr2rjPgfkbZ";
        const ipfsIdHash = ipfsIdToIpfsIdHash(ipfsIdToPermit);

        pkpContract = await pkpContract.connect(tester);

        // validate that the ipfs ID is not permitted
        let permitted = await routerContract.isPermittedAction(
          tokenId,
          ipfsIdHash
        );
        expect(permitted).equal(false);

        // attempt to permit it
        routerContract = await routerContract.connect(tester);
        expect(
          routerContract.addPermittedAction(tokenId, ipfsIdHash)
        ).revertedWith(
          "Please register your Lit Action IPFS ID with the registerAction() function before permitting it to use a PKP"
        );
        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(false);

        // register and permit the lit action all at once
        let registered = await routerContract.isActionRegistered(ipfsIdHash);
        expect(registered).equal(false);
        const multihashStruct = getBytes32FromMultihash(ipfsIdToPermit);
        await routerContract.registerAndAddPermittedAction(
          tokenId,
          multihashStruct.digest,
          multihashStruct.hashFunction,
          multihashStruct.size
        );
        registered = await routerContract.isActionRegistered(ipfsIdHash);
        expect(registered).equal(true);

        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(true);

        // revoke
        await routerContract.removePermittedAction(tokenId, ipfsIdHash);
        permitted = await routerContract.isPermittedAction(tokenId, ipfsIdHash);
        expect(permitted).equal(false);
      });
    });
  });
});
