#!/usr/bin/env python3
"""
Decentralized Search API using The Graph + weighted substring ranking

Flow:
  1. User makes a GET request to /search?q=searchTerm.
  2. The API queries your subgraph for agents whose 'isActive' is true
     in batches (max 1000 per query). (Currently, the search term is not used on-chain.)
  3. All fetched agents are then ranked off-chain by counting occurrences of the search term
     (case-insensitive) in multiple fields with different weights:
       - name (weight: 3)
       - description (weight: 2)
       - socialLink, profileUrl, address, adminAddress (weight: 1 each)
  4. The top 10 ranked agents are returned as JSON.
"""

import os
from dotenv import load_dotenv
import requests
from flask import Flask, request, jsonify
from flask_cors import CORS

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
CORS(app)

# Environment variable for your subgraph endpoint on The Graph
SUBGRAPH_URL = os.environ.get("SUBGRAPH_URL", "")
# The Graph typically returns at most 1000 records per query.
PAGE_SIZE = 1000

def fetch_agents_from_subgraph(search_term):
    """
    Fetch agents from your subgraph whose 'isActive' is true,
    in paginated batches of PAGE_SIZE until no more remain.
    
    NOTE: The current GraphQL query does not filter by search_term.
    We fetch all active agents and then rank them locally.
    """
    if not SUBGRAPH_URL:
        raise ValueError("SUBGRAPH_URL environment variable is not set.")

    agents = []
    skip = 0

    while True:
        graphql_query = """
        query ($first: Int!, $skip: Int!) {
          agents(
            where: {
              isActive: true
            },
            orderBy: name,
            orderDirection: asc,
            first: $first,
            skip: $skip
          ) {
            id
            name
            socialLink
            profileUrl
            address
            description
            adminAddress
            isActive
            lastUpdateTime
          }
        }
        """

        variables = {
            "term": search_term,  # Unused in the query; could be added for on-chain filtering.
            "first": PAGE_SIZE,
            "skip": skip
        }

        response = requests.post(
            SUBGRAPH_URL,
            json={"query": graphql_query, "variables": variables}
        )

        if response.status_code != 200:
            raise Exception(f"GraphQL query failed with status {response.status_code}: {response.text}")

        data = response.json()
        if "errors" in data:
            raise Exception(f"GraphQL returned errors: {data['errors']}")

        batch = data["data"]["agents"]
        if not batch:
            break  # No more agents to fetch
        agents.extend(batch)

        if len(batch) < PAGE_SIZE:
            break  # End of data reached
        skip += PAGE_SIZE

    return agents

def rank_agents(search_term, agents):
    """
    Rank agents by counting occurrences of the search term in their fields,
    using a weighted substring match:
      - name: weight ×3
      - description: weight ×2
      - socialLink, profileUrl, address, adminAddress: weight ×1 each

    Agents with at least one occurrence will have a nonzero score.
    Returns the top 10 agents sorted by score (highest first).
    """
    search_term_lower = search_term.lower()

    for agent in agents:
        name = agent.get("name", "") or ""
        description = agent.get("description", "") or ""
        socialLink = agent.get("socialLink", "") or ""
        profileUrl = agent.get("profileUrl", "") or ""
        address = agent.get("address", "") or ""
        adminAddress = agent.get("adminAddress", "") or ""

        score = (3 * name.lower().count(search_term_lower) +
                 2 * description.lower().count(search_term_lower) +
                 socialLink.lower().count(search_term_lower) +
                 profileUrl.lower().count(search_term_lower) +
                 address.lower().count(search_term_lower) +
                 adminAddress.lower().count(search_term_lower))
        agent["score"] = score

    # Only include agents with a nonzero score and sort descending by score.
    ranked_agents = sorted([agent for agent in agents if agent["score"] > 0],
                             key=lambda x: x["score"],
                             reverse=True)
    return ranked_agents[:10]

@app.route('/search', methods=['GET'])
def search():
    """
    API endpoint: Expects a query parameter "q".
    1) Fetch all isActive agents from the subgraph.
    2) Rank them using a weighted substring count across multiple fields.
    3) Return the top 10 agents as JSON.
    """
    user_query = request.args.get("q", "").strip()
    if not user_query:
        return jsonify({"error": "Missing query parameter 'q'"}), 400

    try:
        agents = fetch_agents_from_subgraph(user_query)
        top_agents = rank_agents(user_query, agents)
        return jsonify(top_agents), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    if not SUBGRAPH_URL:
        print("Please set the SUBGRAPH_URL environment variable to your subgraph's endpoint.")
        exit(1)

    # Start the API server on port 5001 (adjust as needed)
    app.run(host="0.0.0.0", port=5001)