const { Command } = require("@be-true/server");

class AddDependenciesCommand extends Command {
    code = 'gant/dependencies/add';

    async handle(params, { repoGant }) {
        console.log(params, repoGant);
        return {};
    }
}

module.exports = {
    AddDependenciesCommand
}