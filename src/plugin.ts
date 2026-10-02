import streamDeck from "@elgato/streamdeck";

import { DialControl } from "./actions/dial-control";

// "info" keeps the log files small. Switch to "trace" temporarily to record every message
// between Stream Deck and the plugin when debugging.
streamDeck.logger.setLevel("info");

streamDeck.actions.registerAction(new DialControl());

// Finally, connect to the Stream Deck.
streamDeck.connect();
