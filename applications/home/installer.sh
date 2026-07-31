#!/bin/bash

# FAJU — Field Activity & Merchandiser Monitoring System
# Installer script for ember-tribe project

# Install npm packages
npm i leaflet
npm i chart.js

# Generate routes
ember g route dashboard
ember g route agencies
ember g route agencies/agency
ember g route agencies/new
ember g route brands
ember g route brands/brand
ember g route brands/new
ember g route resellers
ember g route resellers/reseller
ember g route resellers/new
ember g route campaigns
ember g route campaigns/campaign
ember g route campaigns/new
ember g route promoters
ember g route promoters/promoter
ember g route promoters/new
ember g route customers
ember g route customers/customer
ember g route customers/new
ember g route checkins
ember g route checkins/checkin
ember g route checkins/new
ember g route map
ember g route reports

# Generate controllers
ember g controller agencies
ember g controller brands
ember g controller resellers
ember g controller campaigns
ember g controller promoters
ember g controller customers
ember g controller checkins
ember g controller map
ember g controller reports

# Generate components
ember g component stat-card -gc
ember g component campaign-status-badge -gc
ember g component promoter-status-badge -gc
ember g component checkin-card -gc
ember g component checkin-map -gc
ember g component side-nav -gc
ember g component page-header -gc
ember g component data-table -gc
ember g component confirm-modal -gc
ember g component pagination-controls -gc

# Generate helpers
ember g helper format-date
ember g helper format-rating

# Generate modifiers
ember g modifier leaflet-map

# Generate services
ember g service checkin-service
