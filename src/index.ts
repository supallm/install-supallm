#!/usr/bin/env node

import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import axios from "axios";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";
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
    log(yellow("Let's configure your user account."));

    const answers = await inquirer.prompt([
      {
        type: "input",
        name: "INITIAL_USER_EMAIL",
        message: "Enter your email:",
        default: "admin@supallm.com",
        validate: (input) => {
          if (!input) {
            return "Email cannot be empty.";
          }
          return true;
        },
      },
      {
        type: "input",
        name: "INITIAL_USER_PASSWORD",
        message: "Enter your password:",
        default: "supallm123",
        validate: (input) => {
          if (!input) {
            return "Password cannot be empty.";
          }
          return true;
        },
      },
    ]);

    // Modify .env file
    let envContent = fs.readFileSync(".env", "utf8");
    envContent = envContent.replace(
      /^INITIAL_USER_EMAIL=.*/m,
      `INITIAL_USER_EMAIL=${answers.INITIAL_USER_EMAIL}`,
    );
    envContent = envContent.replace(
      /^INITIAL_USER_PASSWORD=.*/m,
      `INITIAL_USER_PASSWORD=${answers.INITIAL_USER_PASSWORD}`,
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

    const { frontendPort, backendPort } = await inquirer.prompt([
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
      {
        type: "input",
        name: "backendPort",
        message:
          "Enter the port you want to run the Supallm API on (default is 3001):",
        default: "3001",
        validate: (input, answers) => {
          const port = parseInt(input, 10);

          if (parseInt(answers.frontendPort) === port) {
            return "Port cannot be the same as the frontend port.";
          }

          if ([3000, 5431, 6379].includes(port)) {
            return "Port is already in use. Please choose a different port than 3000, 5431, 6379.";
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

    if (backendPort) {
      envContent = envContent.replace(
        /^BACKEND_PORT=.*/m,
        `BACKEND_PORT=${backendPort}`,
      );
      envContent = envContent.replace(
        /^SUPALLM_API_URL=.*/m,
        `SUPALLM_API_URL=http://localhost:${backendPort}`,
      );
      fs.writeFileSync(".env", envContent);
    }
  }

  log(green("\n🎉 Your Supallm instance is ready."));
  log("------------------------------------------------");

  const { startDocker } = await inquirer.prompt([
    {
      type: "list",
      name: "startDocker",
      message: "Start the stack now?",
      choices: ["Yes", "No, I will do it myself"],
    },
  ]);

  if (startDocker === "Yes") {
    execSync("docker compose up --build -d", { stdio: "inherit" });
    log(`📄 Next Step:      
      
      🚀  Open the dashboard at ${cyan(`http://localhost:${dashboardPort}`)} 🚀
      `);
  } else {
    log(`📄 Next Steps:

    1️⃣  Start your stack with: ${cyan("docker compose up -d")}
    
    2️⃣  Open the dashboard at ${cyan(`http://localhost:${dashboardPort}`)} 🚀
    `);
  }
})();
