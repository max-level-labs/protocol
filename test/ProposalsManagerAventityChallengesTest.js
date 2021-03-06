// This file is a copy of ProposalsManagerChallengesTest.js.

const testHelper = require("./helpers/testHelper");
const votingTestHelper = require("./helpers/votingTestHelper");
const AventitiesManager = artifacts.require("AventitiesManager");

contract('ProposalsManager - Aventity challenges', async () => {
  let validAventityId = 0;
  let validAventityDeposit = new web3.BigNumber(0);
  let validChallengeDeposit = new web3.BigNumber(0);
  let validChallengeProposalId = 0;

  const challengeOwner = testHelper.getAccount(1);
  const voter1 =  testHelper.getAccount(2);
  const voter2 =  testHelper.getAccount(3);
  const challengeEnder = testHelper.getAccount(4);
  const ONE_AVT = new web3.BigNumber(1 * 10**18);
  const stake = ONE_AVT;
  // const fixedPercentageToWinner = 10;
  // const fixedPercentageToChallengeEnder = 10;
  const broker = testHelper.getAccount(4);

  before(async () => {
    await votingTestHelper.before();

    proposalsManager = testHelper.getProposalsManager();
    avtManager = testHelper.getAVTManager();
    aventitiesManager = await AventitiesManager.deployed();

    avt = testHelper.getAVTContract();
  });

  async function registerAventityMember(_aventityAddress, _type) {
    validAventityDeposit = await aventitiesManager.getAventityMemberDeposit(_type);
    await makeDeposit(validAventityDeposit, _aventityAddress);
    await aventitiesManager.registerAventityMember(_aventityAddress, _type, testHelper.evidenceURL, "Registering aventity");
    const eventArgs = await testHelper.getEventArgs(aventitiesManager.LogAventityMemberRegistered);
    validAventityId = eventArgs.aventityId.toNumber();
  }

  async function deregisterAventityAndWithdrawDeposit(_aventityAddress, _type) {
    await aventitiesManager.deregisterAventity(validAventityId);
    // check that this action was properly logged
    const eventArgs = await testHelper.getEventArgs(aventitiesManager.LogAventityMemberDeregistered);
    assert.equal(eventArgs.aventityAddress, _aventityAddress, "wrong address");

    let deposit = await aventitiesManager.getAventityMemberDeposit(_type);
    await avtManager.withdraw("deposit", deposit, {from: _aventityAddress});
  }

  async function getExistingAventityDeposit(_aventityId) {
    return await aventitiesManager.getExistingAventityDeposit(_aventityId);
  }

  async function createAventityChallengeSucceeds() {
    validChallengeDeposit = await getExistingAventityDeposit(validAventityId);
    await makeDeposit(validChallengeDeposit, challengeOwner);
    await proposalsManager.createAventityChallenge(validAventityId, {from: challengeOwner});
    const eventArgs = await testHelper.getEventArgs(proposalsManager.LogCreateAventityChallenge);

    const oldChallengeProposalId = validChallengeProposalId;
    validChallengeProposalId = eventArgs.proposalId.toNumber();
    assert.equal(validChallengeProposalId, oldChallengeProposalId + 1);
  }

  async function createAventityChallengeFails(_deposit, _aventityId) {
    await makeDeposit(_deposit, challengeOwner);
    await testHelper.expectRevert(() => proposalsManager.createAventityChallenge(_aventityId, {from: challengeOwner}));
    await withdrawDeposit(_deposit, challengeOwner);
  }

  async function endChallengeAventity(votesFor, votesAgainst) {
    await testHelper.advanceTimeToEndOfProposal(validChallengeProposalId);
    await proposalsManager.endProposal(validChallengeProposalId, {from: challengeEnder});
    const eventArgs = await testHelper.getEventArgs(proposalsManager.LogEndProposal);
    assert.equal(validChallengeProposalId, eventArgs.proposalId.toNumber());
    assert.equal(votesFor, eventArgs.votesFor.toNumber());
    assert.equal(votesAgainst, eventArgs.votesAgainst.toNumber());
  }

  async function makeDeposit(_depositAmount, _depositer) {
    if (_depositer != testHelper.getAccount(0)) {
      // Any other account will not have any AVT: give them what they need.
      await avt.transfer(_depositer, _depositAmount);
    }
    await avt.approve(avtManager.address, _depositAmount, {from: _depositer});
    await avtManager.deposit('deposit', _depositAmount, {from: _depositer});
  }

  async function withdrawDeposit(_withdrawlAmount, _withdrawer) {
    await avtManager.withdraw('deposit', _withdrawlAmount, {from: _withdrawer});
  }

  async function depositStake(_stakeAmount, _depositer) {
    if (_depositer != testHelper.getAccount(0)) {
      // Any other account will not have any AVT: give them what they need.
      await avt.transfer(_depositer, _stakeAmount);
    }
    await avt.approve(avtManager.address, _stakeAmount, {from: _depositer});
    await avtManager.deposit('stake', _stakeAmount, {from: _depositer});
  }

  async function withdrawStake(_withdrawlAmount, _withdrawer) {
    await avtManager.withdraw('stake', _withdrawlAmount, {from: _withdrawer});
  }

  context("Challenge deposit", async () => {
    it("can get the correct aventity deposit", async () => {
      let deposit = await getExistingAventityDeposit(validAventityId);
      assert.equal(deposit.toString(), validAventityDeposit.toString());
    });

    it("cannot get the aventity deposit for non-existent aventities", async () => {
      let deposit = await getExistingAventityDeposit(999999);
      assert.equal(deposit.toNumber(), 0);
    });
  });

  function fixedAmountToWinner() {
    // Winner currently gets 10%.
    return validChallengeDeposit.dividedToIntegerBy(10);
  }

  function fixedAmountToChallengeEnder() {
    // Challenge ender currently gets 10%
    return validChallengeDeposit.dividedToIntegerBy(10);
  }

  context("Create and end challenge - no votes", async () => {
    beforeEach(async () => {
      await registerAventityMember(broker, testHelper.brokerAventityType);
    });

    afterEach(async () => {
      await deregisterAventityAndWithdrawDeposit(broker, testHelper.brokerAventityType);
    });

    after(async () => await testHelper.checkFundsEmpty());

    async function withdrawDepositsAfterChallengeEnds() {
      // No one voted. The aventity owner wins their fixed amount...
      await withdrawDeposit(fixedAmountToWinner(), broker);
      // ...the challenge ender gets the rest.
      await withdrawDeposit(validChallengeDeposit.minus(fixedAmountToWinner()), challengeEnder);
    }

    it("can create and end a challenge to a valid aventity", async () => {
      await createAventityChallengeSucceeds();
      await endChallengeAventity(0, 0);
      await withdrawDepositsAfterChallengeEnds();
    });

    it("cannot create a challenge to a non-existing aventity", async () => {
      const correctDeposit = await getExistingAventityDeposit(validAventityId);
      const wrongAventityId = 99999;
      await createAventityChallengeFails(correctDeposit, wrongAventityId);
    });

    it("cannot create a challenge to an aventity without sufficient deposit", async () => {
      const insufficientDeposit = (await getExistingAventityDeposit(validAventityId)).minus(new web3.BigNumber(1));
      await createAventityChallengeFails(insufficientDeposit, validAventityId);
    });

    it("cannot create more than one challenge to an aventity", async () => {
      await createAventityChallengeSucceeds();
      await createAventityChallengeFails(validChallengeDeposit, validAventityId);
      await endChallengeAventity(0, 0);
      await withdrawDepositsAfterChallengeEnds();
    });

    it("cannot end a non-existent challenge", async () => {
      await createAventityChallengeSucceeds();
      await testHelper.expectRevert(() => proposalsManager.endProposal(99999999, {from: challengeEnder}));
      await endChallengeAventity(0, 0);
      await withdrawDepositsAfterChallengeEnds();
    });

    it ("cannot deregister an aventity when under challenge", async () => {
      await createAventityChallengeSucceeds();
      await testHelper.expectRevert(() => aventitiesManager.deregisterAventity(validAventityId));
      await endChallengeAventity(0, 0);
      await withdrawDepositsAfterChallengeEnds();
    });

    it("cannot create a challenge to deregistered aventity", async () => {
      await deregisterAventityAndWithdrawDeposit(broker, testHelper.brokerAventityType);
      validChallengeDeposit = await aventitiesManager.getAventityMemberDeposit(testHelper.brokerAventityType);
      await makeDeposit(validChallengeDeposit, challengeOwner);
      await testHelper.expectRevert(() => proposalsManager.createAventityChallenge(validAventityId, {from: challengeOwner}));
      await withdrawDeposit(validChallengeDeposit, challengeOwner);
      // registering again so the AfterEach block doesn't break for this test
      await registerAventityMember(broker, testHelper.brokerAventityType);
    });
  });

  context("End challenge - with votes", async () => {
    let winningsRemainder = 0, newBrokerAccountNum = 5, newBrokerAccount; /*inline declaration to help git align correctly*/

    beforeEach(async () => {
      newBrokerAccount = testHelper.getAccount(newBrokerAccountNum++);
      await registerAventityMember(newBrokerAccount, testHelper.brokerAventityType);
      await createAventityChallengeSucceeds();
      await depositStake(stake, voter1);
      await depositStake(stake, voter2);
    });

    afterEach(async () => {
      await withdrawStake(stake, voter1);
      await withdrawStake(stake, voter2);
    });

    after(async () => {
      if (winningsRemainder > 0) {
        console.log("TODO: Deal with remainder of ", winningsRemainder);
      } else {
        await testHelper.checkFundsEmpty();
      }
    });

    async function voteToMarkAventityAsFraudulentAndWithdrawWinnings() {
      await testHelper.advanceTimeToVotingStart(validChallengeProposalId);
      const signedMessage1 = await votingTestHelper.castVote(validChallengeProposalId, 1, voter1);
      const signedMessage2 = await votingTestHelper.castVote(validChallengeProposalId, 1, voter2);
      await testHelper.advanceTimeToRevealingStart(validChallengeProposalId);
      await votingTestHelper.revealVote(signedMessage1, validChallengeProposalId, 1, voter1);
      await votingTestHelper.revealVote(signedMessage2, validChallengeProposalId, 1, voter2);
      await endChallengeAventity(stake * 2, 0);
      // Challenge won, the winner is the challenge owner.
      await withdrawDeposit(fixedAmountToWinner(), challengeOwner);
      // The challenge ender gets their bit.
      await withdrawDeposit(fixedAmountToChallengeEnder(), challengeEnder);
      // Winning voters get the rest.
      await proposalsManager.claimVoterWinnings(validChallengeProposalId, {from: voter1});
      await proposalsManager.claimVoterWinnings(validChallengeProposalId, {from: voter2});
      const totalVoterWinnings = validAventityDeposit.minus(fixedAmountToWinner()).minus(fixedAmountToChallengeEnder());
      await withdrawDeposit(totalVoterWinnings.dividedToIntegerBy(2), voter1);
      await withdrawDeposit(totalVoterWinnings.dividedToIntegerBy(2), voter2);
      // Challenge is over, withdraw the deposit.
      await withdrawDeposit(validChallengeDeposit, challengeOwner);
      winningsRemainder += totalVoterWinnings.mod(2).toNumber();
    }

    it("pays the correct winnings in the case of agreement winning", async () => {
      await voteToMarkAventityAsFraudulentAndWithdrawWinnings();
    });

    it("pays the correct winnings in the case of disagreement winning", async () => {
      await testHelper.advanceTimeToVotingStart(validChallengeProposalId);
      const signedMessage = await votingTestHelper.castVote(validChallengeProposalId, 2, voter1);
      await testHelper.advanceTimeToRevealingStart(validChallengeProposalId);
      await votingTestHelper.revealVote(signedMessage, validChallengeProposalId, 2, voter1);

      await endChallengeAventity(0, stake);
      // Challenge lost, the winner is the aventity owner.
      await withdrawDeposit(fixedAmountToWinner(), newBrokerAccount);
      // The challenge ender gets their bit.

      await withdrawDeposit(fixedAmountToChallengeEnder(), challengeEnder);
      // Winning voter gets the rest.
      await proposalsManager.claimVoterWinnings(validChallengeProposalId, {from: voter1});
      await withdrawDeposit(validChallengeDeposit.minus(fixedAmountToWinner()).minus(fixedAmountToChallengeEnder()), voter1);
      await deregisterAventityAndWithdrawDeposit(newBrokerAccount, testHelper.brokerAventityType);
    });

    it("pays the correct winnings in the case of disagreement winning via a 'score draw'", async () => {
      await testHelper.advanceTimeToVotingStart(validChallengeProposalId);
      const signedMessage1 = await votingTestHelper.castVote(validChallengeProposalId, 1, voter1);
      const signedMessage2 = await votingTestHelper.castVote(validChallengeProposalId, 2, voter2);
      await testHelper.advanceTimeToRevealingStart(validChallengeProposalId);
      await votingTestHelper.revealVote(signedMessage1, validChallengeProposalId, 1, voter1);
      await votingTestHelper.revealVote(signedMessage2, validChallengeProposalId, 2, voter2);

      await endChallengeAventity(stake, stake);
      // Challenge lost, the winner is the aventity.
      await withdrawDeposit(fixedAmountToWinner(), newBrokerAccount);
      // The challenge ender gets their bit.
      await withdrawDeposit(fixedAmountToChallengeEnder(), challengeEnder);
      // Winning voter gets the rest.
      await proposalsManager.claimVoterWinnings(validChallengeProposalId, {from: voter2});
      await withdrawDeposit(validChallengeDeposit.minus(fixedAmountToWinner()).minus(fixedAmountToChallengeEnder()), voter2);

      await deregisterAventityAndWithdrawDeposit(newBrokerAccount, testHelper.brokerAventityType);
    });

    it("pays the correct winnings in the case of disagreement winning via a 'no-score draw'", async () => {
      await testHelper.advanceTimeToVotingStart(validChallengeProposalId);
      const signedMessage1 = await votingTestHelper.castVote(validChallengeProposalId, 1, voter1);
      const signedMessage2 = await votingTestHelper.castVote(validChallengeProposalId, 2, voter2);
      // No-one reveals their votes before the deadline.

      await endChallengeAventity(0, 0);

      await votingTestHelper.revealVote(signedMessage1, validChallengeProposalId, 1, voter1);
      await votingTestHelper.revealVote(signedMessage2, validChallengeProposalId, 2, voter2);

      // Challenge lost, the winner is the aventity.
      await withdrawDeposit(fixedAmountToWinner(), newBrokerAccount);
      // The challenge ender gets the rest.
      await withdrawDeposit(validChallengeDeposit.minus(fixedAmountToWinner()), challengeEnder);

      await deregisterAventityAndWithdrawDeposit(newBrokerAccount, testHelper.brokerAventityType);
    });

    // TODO: Implement test: "can only sell and refund tickets if aventity has not been deemed fraudulent" (issue #552)

    it("cannot deregister aventity if fraudulent", async () => {
      await voteToMarkAventityAsFraudulentAndWithdrawWinnings();
      // Aventity is now marked as fraudulent - we can not deregister it.
      await testHelper.expectRevert(() => aventitiesManager.deregisterAventity(validAventityId));
    });
  });
});
