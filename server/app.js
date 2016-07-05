'use strict';

const pgp = require('pg-promise');
const path = require('path');
const express = require('express');
const passport = require('passport');
const exphbs = require('express-handlebars');
const session = require('express-session');
const compress = require('compression');
const favicon = require('serve-favicon');
const bodyParser = require('body-parser');
const pgSession = require('connect-pg-simple')(session);

const envPath = global.ENV_PATH ? global.ENV_PATH : '.env';
require('dotenv').config({path: envPath});

const configurePassport = require('./util/configure-passport');
const dbConfig = require('../config/db-config');
const api = require('./api');

// Heroku sets NODE_ENV to production by default. So if we're not
// on Heroku, we assume that we're developing locally.
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_DIR = __dirname;
const PROJECT_ROOT = path.normalize(`${BASE_DIR}/..`);
const ASSETS_PATH = path.join(PROJECT_ROOT, 'client-dist');
const STATIC_PATH = path.join(BASE_DIR, 'static');
const VIEWS_DIR = path.join(BASE_DIR, 'views');

module.exports = function() {
  const app = express();

  app.set('env', NODE_ENV);

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: true}));
  app.use(compress());
  app.use(favicon(path.join(__dirname, 'favicon.ico')));
  app.use(express.static(ASSETS_PATH));
  app.use(express.static(STATIC_PATH));

  const sessionStore = new pgSession({
    pg: pgp.pg,
    conString: dbConfig,
    // Turn off interval pruning when testing, as it prevents the DB
    // connection from closing.
    pruneSessionInterval: !global.TESTING
  });

  app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    // 30 day cookie
    cookie: {maxAge: 30 * 24 * 60 * 60 * 1000}
  }));

  configurePassport();

  app.use(passport.initialize());
  app.use(passport.session());

  app.use('/api', api);

  // Configure the templating engine
  const hbsOptions = {
    extname: '.hbs',
    layoutsDir: `${VIEWS_DIR}/layouts`,
    partialsDir: `${VIEWS_DIR}/partials`,
    defaultLayout: 'main'
  };
  app.set('view engine', '.hbs');
  app.set('views', VIEWS_DIR);
  app.engine('.hbs', exphbs(hbsOptions));

  const port = process.env.PORT || 5000;
  app.set('port', port);

  const googleSettings = {scope: ['profile']};
  app.get('/login/google', passport.authenticate('google', googleSettings));

  const redirects = {
    failureRedirect: '/login'
  };

  app.get(
    '/auth/google/callback',
    passport.authenticate('google', redirects),
    (req, res) => {
      // Explicitly save the session before redirecting!
      req.session.save(() => {
        res.redirect('/');
      });
    }
  );

  app.get('/logout', (req, res) => {
    req.logout();
    req.session.save(() => {
      res.redirect('/login');
    });
  });

  // Every route is served by our JS app
  app.get('*', (req, res) => {
    res.locals.devMode = res.app.get('env') === 'development';

    res.locals.initialData = JSON.stringify({
      auth: {
        user: req.user
      }
    });

    return res.render('index');
  });

  if (!global.TESTING) {
    app.listen(port, () => {
      console.log(`Node app is running at localhost:${port}`);
    });
  }

  return app;
};
