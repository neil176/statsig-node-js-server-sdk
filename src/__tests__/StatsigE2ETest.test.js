const CONFIG_SPEC_RESPONSE = JSON.stringify(
  require('./download_config_spec.json'),
);

const INIT_RESPONSE = require('./initialize_response.json');

describe('Verify e2e behavior of the SDK with mocked network', () => {
  jest.mock('node-fetch', () => jest.fn());
  const statsigUser = {
    userID: '123',
    email: 'testuser@statsig.com',
  };
  const randomUser = {
    userID: 'random',
    privateAttributes: {
      email: undefined,
    },
  };
  let postedLogs = {};
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();

    const fetch = require('node-fetch');
    fetch.mockImplementation((url, params) => {
      if (url.includes('download_config_specs')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(CONFIG_SPEC_RESPONSE),
        });
      }
      if (url.includes('log_event')) {
        postedLogs = JSON.parse(params.body);
        return Promise.resolve({
          ok: true,
        });
      }
      return Promise.reject();
    });
  });

  test('Verify checkGate and exposure logs', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-123');
    const on = await statsig.checkGate(statsigUser, 'always_on_gate');
    expect(on).toEqual(true);
    const passingEmail = await statsig.checkGate(
      statsigUser,
      'on_for_statsig_email',
    );
    expect(passingEmail).toEqual(true);
    const failingEmail = await statsig.checkGate(
      randomUser,
      'on_for_statsig_email',
    );
    expect(failingEmail).toEqual(false);

    statsig.shutdown();
    expect(postedLogs.events.length).toEqual(3);
    expect(postedLogs.events[0].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[0].metadata['gate']).toEqual('always_on_gate');
    expect(postedLogs.events[0].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[0].metadata['ruleID']).toEqual(
      '6N6Z8ODekNYZ7F8gFdoLP5',
    );

    expect(postedLogs.events[1].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[1].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[1].metadata['gateValue']).toEqual('true');
    expect(postedLogs.events[1].metadata['ruleID']).toEqual(
      '7w9rbTSffLT89pxqpyhuqK',
    );

    expect(postedLogs.events[2].eventName).toEqual('statsig::gate_exposure');
    expect(postedLogs.events[2].metadata['gate']).toEqual(
      'on_for_statsig_email',
    );
    expect(postedLogs.events[2].metadata['gateValue']).toEqual('false');
    expect(postedLogs.events[2].metadata['ruleID']).toEqual('default');
  });

  test('Verify getConfig and exposure logs', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-123');
    let config = await statsig.getConfig(statsigUser, 'test_config');
    expect(config.get('number', 0)).toEqual(7);
    expect(config.get('string', '')).toEqual('statsig');
    expect(config.get('boolean', true)).toEqual(false);
    config = await statsig.getConfig(randomUser, 'test_config');
    expect(config.get('number', 0)).toEqual(4);
    expect(config.get('string', '')).toEqual('default');
    expect(config.get('boolean', false)).toEqual(true);

    statsig.shutdown();
    expect(postedLogs.events.length).toEqual(2);
    expect(postedLogs.events[0].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[0].metadata['config']).toEqual('test_config');
    expect(postedLogs.events[0].metadata['ruleID']).toEqual(
      '1kNmlB23wylPFZi1M0Divl',
    );

    expect(postedLogs.events[1].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[1].metadata['config']).toEqual('test_config');
    expect(postedLogs.events[1].metadata['ruleID']).toEqual('default');
  });

  test('Verify getExperiment and exposure logs', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-123');
    let experiment = await statsig.getExperiment(
      statsigUser,
      'sample_experiment',
    );
    expect(experiment.get('experiment_param', '')).toEqual('test');
    experiment = await statsig.getExperiment(randomUser, 'sample_experiment');
    expect(experiment.get('experiment_param', '')).toEqual('control');

    statsig.shutdown();
    expect(postedLogs.events.length).toEqual(2);
    expect(postedLogs.events[0].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[0].metadata['config']).toEqual(
      'sample_experiment',
    );
    expect(postedLogs.events[0].metadata['ruleID']).toEqual(
      '2RamGujUou6h2bVNQWhtNZ',
    );

    expect(postedLogs.events[1].eventName).toEqual('statsig::config_exposure');
    expect(postedLogs.events[1].metadata['config']).toEqual(
      'sample_experiment',
    );
    expect(postedLogs.events[1].metadata['ruleID']).toEqual(
      '2RamGsERWbWMIMnSfOlQuX',
    );
  });

  test('Verify getLayer and exposure logs', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-123');

    let layer = await statsig.getLayer(statsigUser, 'a_layer');
    expect(layer.get('experiment_param', '')).toEqual('test');
    expect(layer.get('layer_param', false)).toBe(true);
    expect(layer.get('second_layer_param', false)).toBe(true);

    layer = await statsig.getLayer(randomUser, 'b_layer_no_alloc');
    expect(layer.get('b_param', '')).toEqual('layer_default');

    layer = await statsig.getLayer(randomUser, 'c_layer_with_holdout');
    expect(layer.get('holdout_layer_param', '')).toEqual('layer_default');

    statsig.shutdown();

    expect(postedLogs.events.length).toEqual(3);

    expect(postedLogs.events[0].eventName).toEqual('statsig::layer_exposure');
    expect(postedLogs.events[0].secondaryExposures).toEqual([]);
    expect(postedLogs.events[0].metadata).toEqual({
      config: 'a_layer',
      ruleID: '2RamGujUou6h2bVNQWhtNZ',
      allocatedExperiment: 'sample_experiment',
    });

    expect(postedLogs.events[1].eventName).toEqual('statsig::layer_exposure');
    expect(postedLogs.events[1].secondaryExposures).toEqual([]);
    expect(postedLogs.events[1].metadata).toEqual({
      config: 'b_layer_no_alloc',
      ruleID: 'default',
      allocatedExperiment: '',
    });

    expect(postedLogs.events[2].eventName).toEqual('statsig::layer_exposure');
    expect(postedLogs.events[2].secondaryExposures).toEqual([
      {
        gate: 'always_on_gate',
        gateValue: 'true',
        ruleID: '6N6Z8ODekNYZ7F8gFdoLP5',
      },
    ]);
    expect(postedLogs.events[2].metadata).toEqual({
      config: 'c_layer_with_holdout',
      ruleID: '7d2E854TtGmfETdmJFip1L',
      allocatedExperiment: '',
    });
  });

  test('Verify logEvent', async () => {
    const statsig = require('../index');
    await statsig.initialize('secret-123');
    statsig.logEvent(statsigUser, 'add_to_cart', 'SKU_12345', {
      price: '9.99',
      item_name: 'diet_coke_48_pack',
    });
    statsig.shutdown();

    expect(postedLogs.events.length).toEqual(1);
    expect(postedLogs.events[0].eventName).toEqual('add_to_cart');
    expect(postedLogs.events[0].value).toEqual('SKU_12345');
    expect(postedLogs.events[0].metadata['price']).toEqual('9.99');
    expect(postedLogs.events[0].metadata['item_name']).toEqual(
      'diet_coke_48_pack',
    );
    expect(postedLogs.events[0].user.userID).toEqual('123');
    expect(postedLogs.events[0].user.email).toEqual('testuser@statsig.com');
  });
});
