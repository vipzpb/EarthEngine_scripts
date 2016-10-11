// A UI to interactively filter a collection, select an individual image
// from the results, display it with a variety of visualizations, and export it.

// Source: Jack Chen https://groups.google.com/d/msg/google-earth-engine-developers/tp0aRYvMklE/yLwIPRBvAQAJ

// The namespace for our application.  All the state is kept in here.
var app = {};

/** Creates the UI panels. */
app.createPanels = function() 
{
  /* The introduction section. */
  app.intro = {
    panel: ui.Panel([
      ui.Label({
        value: 'Landsat 8 Explorer',
        style: {fontWeight: 'bold', fontSize: '20px', margin: '10px 2px'}
      }),
    ])
  };

  /* The collection filter controls. */
  app.filters = {
    byPathRow: ui.Checkbox({label: 'By Path/Row', value: true}),
    startDate: ui.Textbox('YYYY-MM-DD', '2015-01-01'),
    endDate: ui.Textbox('YYYY-MM-DD', '2015-12-31'),
    wrsPath: ui.Textbox('','125'),
    wrsRow : ui.Textbox('','46'),
    applyButton: ui.Button('Apply filters', app.applyFilters),
    loadingLabel: ui.Label({
      value: 'Loading...',
      style: {stretch: 'vertical', color: 'gray', shown: false}
    })
    
  };

  /* The panel for the filter control widgets. */
  app.filters.panel = ui.Panel({
    widgets: [
      ui.Label('1) Select filters', {fontWeight: 'bold'}),
      ui.Panel([
        ui.Label('Start date:', app.HELP_TEXT_STYLE), 
        app.filters.startDate],ui.Panel.Layout.flow('horizontal')),
      ui.Panel([  
        ui.Label('End date :', app.HELP_TEXT_STYLE), 
        app.filters.endDate],ui.Panel.Layout.flow('horizontal')),
      ui.Panel([
        ui.Label('WRS2 Path:',app.HELP_TEXT_STYLE),
        app.filters.wrsPath],ui.Panel.Layout.flow('horizontal')),
      ui.Panel([
        ui.Label('WRS2  Row:',app.HELP_TEXT_STYLE),
        app.filters.wrsRow],ui.Panel.Layout.flow('horizontal')),
      app.filters.byPathRow,
      ui.Panel([
        app.filters.applyButton,
        app.filters.loadingLabel], ui.Panel.Layout.flow('horizontal'))
    ],
    style: app.SECTION_STYLE
  });

  /* The image picker section. */
  app.picker = {
    // Create a select with a function that reacts to the "change" event.
    select: ui.Select({
      placeholder: 'Select an image ID',
      onChange: app.refreshMapLayer
    }),
    // Create a button that centers the map on a given object.
    centerButton: ui.Button('Center on map', function() {
      Map.centerObject(Map.layers().get(0).get('eeObject'));
    })
  };

  /* The panel for the picker section with corresponding widgets. */
  app.picker.panel = ui.Panel({
    widgets: [
      ui.Label('2) Select an image', {fontWeight: 'bold'}),
      ui.Panel([
        app.picker.select,
        app.picker.centerButton
      ], ui.Panel.Layout.flow('horizontal'))
    ],
    style: app.SECTION_STYLE
  });

  /* The visualization section. */
  app.vis = {
    label: ui.Label(),
    // Create a select with a function that reacts to the "change" event.
    select: ui.Select({
      items: Object.keys(app.VIS_OPTIONS),
      onChange: function() {
        // Update the label's value with the select's description.
        var option = app.VIS_OPTIONS[app.vis.select.getValue()];
        app.vis.label.setValue(option.description);
        // Refresh the map layer.
        app.refreshMapLayer();
      }
    })
  };

  /* The panel for the visualization section with corresponding widgets. */
  app.vis.panel = ui.Panel({
    widgets: [
      ui.Label('3) Select a visualization', {fontWeight: 'bold'}),
      app.vis.select,
      app.vis.label
    ],
    style: app.SECTION_STYLE
  });

  // Default the select to the first value.
  app.vis.select.setValue(app.vis.select.items().get(0));

  /* The export section. */
  app.export = {
    button: ui.Button({
      label: 'Export the current image to Drive',
      // React to the button's click event.
      onClick: function() {
        // Select the full image id.
        var imageIdTrailer = app.picker.select.getValue();
        var imageId = app.COLLECTION_ID + '/' + imageIdTrailer;
        // Get the visualization options.
        var visOption = app.VIS_OPTIONS[app.vis.select.getValue()];
        // Export the image to Drive.
        Export.image.toDrive({
          image: ee.Image(imageId).select(visOption.visParams.bands),
          description: 'L8_Export-' + imageIdTrailer,
        });
      }
    })
  };

  /* The panel for the export section with corresponding widgets. */
  app.export.panel = ui.Panel({
    widgets: [
      ui.Label('4) Start an export', {fontWeight: 'bold'}),
      app.export.button
    ],
    style: app.SECTION_STYLE
  });
};

/** Creates the app helper functions. */
app.createHelpers = function() 
{
  /**
   * Enables or disables loading mode.
   * @param {boolean} enabled Whether loading mode is enabled.
   */
  app.setLoadingMode = function(enabled) {
    // Set the loading label visibility to the enabled mode.
    app.filters.loadingLabel.style().set('shown', enabled);
    // Set each of the widgets to the given enabled mode.
    var loadDependentWidgets = [
      app.vis.select,
      app.filters.startDate,
      app.filters.endDate,
      app.filters.applyButton,
      app.filters.byPathRow,
      app.picker.select,
      app.picker.centerButton,
      app.export.button
    ];
    loadDependentWidgets.forEach(function(widget) {
      widget.setDisabled(enabled);
    });
  };

  /** Applies the selection filters currently selected in the UI. */
  app.applyFilters = function() {
    app.setLoadingMode(true);
    var filtered = ee.ImageCollection(app.COLLECTION_ID);
    
    // Set filter variables.
    var start = app.filters.startDate.getValue();
    if (start) start = ee.Date(start);
    var end = app.filters.endDate.getValue();
    if (end) end = ee.Date(end);
    if (start) filtered = filtered.filterDate(start, end);

    var path = app.filters.wrsPath.getValue();
    var row  = app.filters.wrsRow.getValue();
    
    // Filter Path/Row to the map if the checkbox is marked.
    if (app.filters.byPathRow.getValue()) {
      print(path,row);
      filtered = filtered.filter([
          ee.Filter.eq('wrs_path', ee.Number.parse(path)),
          ee.Filter.eq('wrs_row', ee.Number.parse(row))]);
      print(filtered);                   
    }
    // Get the list of computed ids.
    var computedIds = filtered
        .limit(app.IMAGE_COUNT_LIMIT)
        .reduceColumns(ee.Reducer.toList(), ['system:index'])
        .get('list');

    computedIds.evaluate(function(ids) {
      // Update the image picker with the given list of ids.
      app.setLoadingMode(false);
      app.picker.select.items().reset(ids);
      // Default the image picker to the first id.
      app.picker.select.setValue(app.picker.select.items().get(0));
    });
  };

  /** Refreshes the current map layer based on the UI widget states. */
  app.refreshMapLayer = function() {
    Map.clear();
    var imageId = app.picker.select.getValue();
    if (imageId) {
      // If an image id is found, create an image.
      var image = ee.Image(app.COLLECTION_ID + '/' + imageId);
      // Add the image to the map with the corresponding visualization options.
      var visOption = app.VIS_OPTIONS[app.vis.select.getValue()];
      Map.addLayer(image, visOption.visParams, imageId);
    }
  };
};

/** Creates the app constants. */
app.createConstants = function() {
  app.COLLECTION_ID = 'LANDSAT/LC8_SR';
  app.SECTION_STYLE = {margin: '20px 0 0 0'};
  app.HELPER_TEXT_STYLE = {
      margin: '8px 0 -3px 8px',
      fontSize: '12px',
      color: 'gray'
  };
  app.IMAGE_COUNT_LIMIT = 50;
  app.VIS_OPTIONS = {
    'False color (B6/B5/B4)': {
      description: 'Vegetation is shades of red, urban areas are ' +
                   'cyan blue, and soils are browns.',
      visParams: {gamma: 1.3, min: -1000, max: 8000, bands: ['B6', 'B5', 'B4']}
    },
    'Natural color (B4/B3/B2)': {
      description: 'Ground features appear in colors similar to their ' +
                   'appearance to the human visual system.',
      visParams: {gamma: 1.3, min: -1000, max: 8000, bands: ['B4', 'B3', 'B2']}
    },
    'Atmospheric (B7/B6/B5)': {
      description: 'Coast lines and shores are well-defined. ' +
                   'Vegetation appears blue.',
      visParams: {gamma: 1.3, min: -1000, max: 8000, bands: ['B7', 'B6', 'B5']}
    }
  };
};

/** Creates the application interface. */
app.boot = function() 
{
  app.createConstants();
  app.createHelpers();
  app.createPanels();
  var main = ui.Panel({
    widgets: [
      app.intro.panel,
      app.filters.panel,
      app.picker.panel,
      app.vis.panel,
      app.export.panel
    ],
    style: {width: '320px', padding: '8px'}
  });
  //Map.setCenter(110.5, 19.5, 9);
  ui.root.insert(0, main);
  app.applyFilters();
};

app.boot();
