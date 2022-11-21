const path = require('path');
const { Application, LoggerService, HttpService, AdapterHttpService, StaticService } = require("@be-true/server");
const { GantRepository } = require('./backend/infra/GantRepository');
const { AddDependenciesCommand } = require('./backend/application/AddDependenciesCommand');

const app = new Application()
    .addService(LoggerService, { config: { pretty: true } })
    .addService(HttpService)
    .addService(AdapterHttpService)
    .addService(StaticService, { config: { 
        prefix: '/', 
        root: path.join(__dirname, "/frontend")
    }})
    .addService(GantRepository)
    .addCommand(new AddDependenciesCommand())
;

app.start()