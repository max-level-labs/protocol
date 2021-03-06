const EventsManager = artifacts.require("EventsManager");
const ProposalsManager = artifacts.require("ProposalsManager");
const AventitiesManager = artifacts.require("AventitiesManager");
const testHelper = require("./testHelper");
const web3Utils = require('web3-utils');

const oneDay = new web3.BigNumber(86400);  // seconds in one day. Solidity uses uint256.
const oneWeek = oneDay.times(7);
let eventsManager, proposalsManager, avt, avtManager;

let validEventId, eventDeposit;

let brokerAddress;
let eventOwner;

let aventities = {};

const eventCapacity = 5;
const eventSupportURL = "my support url that is really just a non-empty string";
const averageTicketPriceInUSCents = 675;
let ticketSaleStartTime, eventTime, eventDesc;
const eventDescBase = "This is NOT an event id: this is event number: ";
let eventCount = 1;

const ticketDetailsBase = "Unallocated seating. Ticket number: ";
let ticketCount = 1;

async function before(_brokerAddress, _eventOwner) {
  await testHelper.before();

  brokerAddress = _brokerAddress;
  eventOwner = _eventOwner;

  eventsManager = await EventsManager.deployed();
  aventitiesManager = await AventitiesManager.deployed();
  proposalsManager = testHelper.getProposalsManager();
  avtManager =  testHelper.getAVTManager();

  avt = testHelper.getAVTContract();
};

after(async () => await testHelper.checkFundsEmpty());

async function makeDeposit(_amount, _depositer) {
  if (_depositer != testHelper.getAccount(0)) {
    // Any other account will not have any AVT: give them what they need.
    await avt.transfer(_depositer, _amount);
  }
  await avt.approve(avtManager.address, _amount, {from: _depositer});
  await avtManager.deposit("deposit", _amount, {from: _depositer});
}

async function withdrawDeposit(_depositAmount, _withdrawer) {
  await avtManager.withdraw("deposit", _depositAmount, {from: _withdrawer});
}

function setupUniqueEventParameters() {
  // Vary the name so we get a unique event every time this is called.
  eventDesc = eventDescBase + eventCount++;
  // Set the times based on "now" as some tests advance the clock.
  ticketSaleStartTime = testHelper.now().plus(30 * oneDay);
  eventTime = ticketSaleStartTime.plus(oneWeek);
}

async function depositAndRegisterAventityMember(_brokerAddress, _type, _evidenceUrl, _desc) {
  let amount = await aventitiesManager.getAventityMemberDeposit(_type);
  await makeDeposit(amount, _brokerAddress);
  await aventitiesManager.registerAventityMember(_brokerAddress, _type, _evidenceUrl, _desc);
  let eventArgs = await testHelper.getEventArgs(aventitiesManager.LogAventityMemberRegistered);
  let aventityId = eventArgs.aventityId.toNumber();
  aventities[_brokerAddress+_type] = aventityId;
}

async function deregisterAventityAndWithdrawDeposit(_brokerAddress, _type) {
  await aventitiesManager.deregisterAventity(aventities[_brokerAddress+_type]);
  let deposit = await aventitiesManager.getAventityMemberDeposit(_type);
  await withdrawDeposit(deposit, _brokerAddress);
}

async function makeEventDeposit() {
  let deposits = await eventsManager.getEventDeposit(eventCapacity, averageTicketPriceInUSCents, ticketSaleStartTime);
  eventDeposit = deposits[1];
  await makeDeposit(eventDeposit, eventOwner);
}

async function withdrawEventDeposit() {
  await withdrawDeposit(eventDeposit, eventOwner);
}

async function endEventAndWithdrawDeposit() {
  await testHelper.advanceTimeToEventEnd(validEventId);
  await eventsManager.unlockEventDeposit(validEventId);
  await withdrawEventDeposit();
}


async function doCreateEvent(_useSignedCreateEvent, _eventTime, _ticketSaleStartTime, _eventSupportURL) {
  if (_useSignedCreateEvent) {
    // Hash the variable length parameters to create fixed length parameters.
    // See: http://solidity.readthedocs.io/en/v0.4.21/abi-spec.html#abi-packed-mode
    let keccak256Msg = await web3Utils.soliditySha3(await web3Utils.soliditySha3(eventDesc), _eventTime, eventCapacity,
        averageTicketPriceInUSCents, _ticketSaleStartTime, await web3Utils.soliditySha3(_eventSupportURL), eventOwner);
    let signedMessage = testHelper.createSignedMessage(eventOwner, keccak256Msg);
    await eventsManager.signedCreateEvent(signedMessage, eventDesc, _eventTime, eventCapacity, averageTicketPriceInUSCents,
        _ticketSaleStartTime, _eventSupportURL, eventOwner, {from: brokerAddress});
  } else {
    await eventsManager.createEvent( eventDesc, _eventTime, eventCapacity, averageTicketPriceInUSCents,
       _ticketSaleStartTime, _eventSupportURL, {from: eventOwner});
  }
}

async function createValidEvent(_useSignedCreateEvent) {
  await doCreateEvent(_useSignedCreateEvent, eventTime, ticketSaleStartTime, eventSupportURL);
  let eventArgs;
  if (_useSignedCreateEvent) {
    eventArgs = await testHelper.getEventArgs(eventsManager.LogSignedEventCreated);
  } else {
    eventArgs = await testHelper.getEventArgs(eventsManager.LogEventCreated);
  }
  assert.equal(eventArgs.eventDesc, eventDesc);
  assert.equal(eventArgs.ticketSaleStartTime.toNumber(), ticketSaleStartTime.toNumber());
  assert.equal(eventArgs.eventTime.toNumber(), eventTime.toNumber());
  assert.equal(eventArgs.averageTicketPriceInUSCents.toNumber(), averageTicketPriceInUSCents);
  validEventId = eventArgs.eventId.toNumber();
}


async function makeEventDepositAndCreateValidEvent(_useSignedCreateEvent) {
  setupUniqueEventParameters();
  await makeEventDeposit();
  await createValidEvent(_useSignedCreateEvent);
}

module.exports = {
  before,
  getTicketSaleStartTime: () => ticketSaleStartTime,
  getEventTime: () => eventTime,
  getValidEventId: () => validEventId,
  getEventDeposit: () => eventDeposit,
  getEventSupportURL: () => eventSupportURL,
  getEventCapacity: () => eventCapacity,
  getEventsManager: () => eventsManager,
  getAventitiesManager: () => aventitiesManager,

  makeDeposit,
  makeEventDeposit,
  withdrawDeposit,
  withdrawEventDeposit,
  setupUniqueEventParameters,
  depositAndRegisterAventityMember,
  deregisterAventityAndWithdrawDeposit,
  doCreateEvent,
  createValidEvent,
  makeEventDepositAndCreateValidEvent,
  endEventAndWithdrawDeposit
}
