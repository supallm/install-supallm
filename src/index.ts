#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import axios from "axios";
import fs from "fs";
import crypto from "crypto";

// ANSI color helpers
const log = console.log;
const green = chalk.green;
const yellow = chalk.yellow;
const cyan = chalk.cyan;
const red = chalk.red;
const bold = chalk.bold;

// Fancy banner
log(
  cyan(`
  ____                    _ _           
 / ___| _   _ _ __   __ _| | |_ __ ___  
 \\___ \\| | | | '_ \\ / _\` | | | '_ \` _ \\ 
  ___) | |_| | |_) | (_| | | | | | | | |
 |____/ \\__,_| .__/ \\__,_|_|_|_| |_| |_|
            |_|                         
======================================
  🚀 SupaLLM Installation Script  
======================================
`),
);

(async () => {
  // Ask for confirmation before downloading
  const { confirmDownload } = await inquirer.prompt([
    {
      type: "list",
      name: "confirmDownload",
      message:
        "We will download the .env and the docker-compose file in the current directory. Any file with the same name will be overridden, continue?",
      choices: ["Continue", "Cancel"],
    },
  ]);

  if (confirmDownload === "Cancel") {
    log(red("Operation cancelled by the user."));
    process.exit(0);
  }

  log(yellow("➡️  Downloading required files..."));

  // Helper to download files
  async function downloadFile(url: string, dest: string) {
    const spinner = ora(`Downloading ${dest}...`).start();
    try {
      const { data } = await axios.get(url, { responseType: "stream" });
      const writer = fs.createWriteStream(dest);
      data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on("finish", resolve);
        writer.on("error", reject);
      });
      spinner.succeed(`${green(dest)} downloaded successfully.`);
    } catch (error) {
      spinner.fail(`${red(`Failed to download ${dest}.`)}`);
      process.exit(1);
    }
  }

  // Download required files
  await downloadFile(
    "https://raw.githubusercontent.com/supallm/supallm/main/docker-compose.yml",
    "docker-compose.yml",
  );
  await downloadFile(
    "https://raw.githubusercontent.com/supallm/supallm/main/.env.exemple",
    ".env",
  );

  let dashboardPort = 3000;

  // Ask for config updates
  const { setupChoice } = await inquirer.prompt([
    {
      type: "list",
      name: "setupChoice",
      message:
        "Now we'll help you to setup your project. How do you want to continue?",
      choices: [
        "Continue with CLI (recommended)",
        "Do a custom config myself (only if you know what you're doing)",
      ],
    },
  ]);

  if (setupChoice === "Continue with CLI (recommended)") {
    log(yellow("We use Clerk to manage users and organizations."));
    log(
      yellow(
        "You can get Clerk keys for FREE at https://clerk.com/. We plan to remove this dependency asap.",
      ),
    );

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "CLERK_PUBLISHABLE_KEY",
        message: "Enter your Clerk Publishable Key:",
        validate: (input) => {
          if (!input) {
            return "Clerk Publishable Key cannot be empty. This is where your organization will be stored.";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "CLERK_SECRET_KEY",
        message: "Enter your Clerk Secret Key:",
        validate: (input) => {
          if (!input) {
            return "Clerk Secret Key cannot be empty. This is where your organization will be stored.";
          }
          return true;
        },
      },
    ]);

    // Modify .env file
    let envContent = fs.readFileSync(".env", "utf8");
    envContent = envContent.replace(
      /^CLERK_PUBLISHABLE_KEY=.*/m,
      `CLERK_PUBLISHABLE_KEY=${answers.CLERK_PUBLISHABLE_KEY}`,
    );
    envContent = envContent.replace(
      /^CLERK_SECRET_KEY=.*/m,
      `CLERK_SECRET_KEY=${answers.CLERK_SECRET_KEY}`,
    );
    fs.writeFileSync(".env", envContent);

    const { generateSecretKey } = await inquirer.prompt([
      {
        type: "confirm",
        name: "generateSecretKey",
        message:
          "Generate a secret key for encrypting sensitive database values? (recommended)",
        default: true,
      },
    ]);

    if (generateSecretKey) {
      const secretKey = crypto.randomBytes(32).toString("base64");
      envContent = envContent.replace(
        /^SECRET_KEY=.*/m,
        `SECRET_KEY=${secretKey}`,
      );
      fs.writeFileSync(".env", envContent);
    }

    const { frontendPort } = await inquirer.prompt([
      {
        type: "input",
        name: "frontendPort",
        message:
          "Enter the port you want to run the dashboard on (default is 3000):",
        default: `${dashboardPort}`,
        validate: (input) => {
          const port = parseInt(input, 10);
          if ([3001, 5431, 6379].includes(port)) {
            return "Port is already in use. Please choose a different port than 3001, 5431, 6379.";
          }
          return true;
        },
      },
    ]);

    dashboardPort = frontendPort;

    if (frontendPort) {
      envContent = envContent.replace(
        /^FRONTEND_PORT=.*/m,
        `FRONTEND_PORT=${frontendPort}`,
      );
      fs.writeFileSync(".env", envContent);
    }
  }

  log(green("\n🎉 Your Supallm instance is ready."));
  log("------------------------------------------------");
  log(`📄 Next Steps:

    1️⃣  Start your stack with: ${cyan("docker compose up -d")}
    
    2️⃣  Open the dashboard at ${cyan(`http://localhost:${dashboardPort}`)} 🚀
    `);
  log(`Run ${cyan("docker compose up -d")} to launch it.`);
})();
