#! /usr/bin/env node

import { CommandInteraction, DMChannel, Message } from 'discord.js';
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('send-stats')
		.setDescription('Starts the process to send in stats from your match.'),
	async execute(interaction: CommandInteraction) {
		let dm = await interaction.user.createDM().catch(() => {
            interaction.reply({ content: 'We failed to send you a DM, so make sure you are allowing them!', ephemeral: true });
        });
        if (dm != null) {
            let task = statsCommand(dm);
            interaction.reply({ content: 'Check your DMs!', ephemeral: true });
            await task;
        }
	},
};

async function getNintendoAccountSessionToken(dm: DMChannel): Promise<{na_session_token: string, loadMessage: Message}> {
    let naApi = await import('nxapi/nintendo-account');
    let auth = naApi.NintendoAccountSessionAuthorisation.create("71b963c1b7b6d119", "openid user user.birthday user.mii user.screenName");

    await dm.send({
        content: "Navigate to " + auth.authorise_url + " and right click Select this person -> `Copy link` and paste it here",
        files: [{ attachment: 'resources/lib_nso_example.png'}],
    });

    const filter = (m: Message) => m.content.startsWith("npf71b963c1b7b6d119://auth")
    let authUrlMessage = await dm.awaitMessages({ filter, max: 1, time: 600_000, errors: ['time'] }).catch(async (error) => {
        await dm.send("Response timeout. Please start the process over.")
        throw error;
    })

    let loadMessage = await dm.send("<a:SplatnetLoad:1163902704192585819> Please wait...");

    let applink = authUrlMessage.first()!.content

    const authorisedurl = new URL(applink);
    const authorisedparams = new URLSearchParams(authorisedurl.hash.substring(1));

    const token = await auth.getSessionToken(authorisedparams);

    return {na_session_token: token.session_token, loadMessage: loadMessage};
};

async function statsCommand(dm: DMChannel) {
    let nxapi = await import('nxapi');

    nxapi.addUserAgent('ccastatsbot/1.0.0 (+https://github.com/Candygoblen123/CCAStatsBot)');

    const {na_session_token, loadMessage} = await getNintendoAccountSessionToken(dm);
    let coralApi = await import('nxapi/coral');
    const nso = await coralApi.default.createWithSessionToken(na_session_token).catch(async (error) => {
        await dm.send("Could not authenticate with Nintendo: " + error + "\nPlease wait an hour, then try again.");
        throw error;
    });
    let coral = nso.nso;
    let coral_auth_data = nso.data;

    let splatnet3Api = await import('nxapi/splatnet3');
    let auth_data = await splatnet3Api.default.createWithCoral(coral, coral_auth_data.user);

    let splatnet = auth_data.splatnet;

    const results = await splatnet.getPrivateBattleHistories();

    const sessions = results.data.privateBattleHistories.historyGroups.nodes;

    const matches = sessions[0].historyDetails.nodes;
    const verification_strings = matches.map(match => {
        return match.playedTime + " : " + match.vsRule.name + " " + match.vsStage.name + " : " + match.judgement;
    });

    let verifyString = ""
    for (let str of verification_strings) {
        verifyString += str + "\n"
    }
    await loadMessage.edit(verifyString);
    const ids = matches.map(match => { return match.id });

    let deets = (await splatnet.getBattleHistoryDetail(ids[0])).data.vsHistoryDetail;
    console.log(deets);

    let deets_string = "Your score: " + deets.myTeam.result?.score + "\n";
    deets_string += "Their score: " + deets.otherTeams[0].result?.score + "\n";

    let duration = Math.floor(deets.duration / 60) + ":" + deets.duration % 60;
    deets_string += "Match length: " + duration + "\n";

    deets_string += "Your team: \n";
    let yourTeamDeets = deets.myTeam.players.map(player => {
        return player.name + ": Weapon: " + player.weapon.name + ", K: " +
            player.result?.kill + ", D: " + player.result?.death + ", A: " +
            player.result?.assist + ", special: " + player.weapon.specialWeapon.name +
            " - " + player.result?.special + ", points: " + player.paint + "p";
    });

    for (let player of yourTeamDeets) {
        deets_string += player + "\n";
    }

    deets_string += "\nTheir team: \n";
    let theirTeamDeets = deets.otherTeams[0].players.map(player => {
        return player.name + ": Weapon: " + player.weapon.name + ", K: " +
            player.result?.kill + ", D: " + player.result?.death + ", A: " +
            player.result?.assist + ", special: " + player.weapon.specialWeapon.name +
            " - " + player.result?.special + ", points: " + player.paint + "p";
    });

    for (let player of theirTeamDeets) {
        deets_string += player + "\n"
    }

    await dm.send(deets_string);
}