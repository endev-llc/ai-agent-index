import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  AgentAdded,
  AgentUpdated,
  AgentDeactivated,
  AgentReactivated,
  AIAgentIndex
} from "../generated/AIAgentIndex/AIAgentIndex"
import { Agent } from "../generated/schema"

function createSearchText(
  name: string,
  description: string,
  address: string,
  socialLink: string,
  profileUrl: string,
  adminAddress: string
): string {
  return [name, description, address, socialLink, profileUrl, adminAddress]
    .join(" ")
    .toLowerCase()
}

function calculateSearchScore(
  searchTerm: string,
  name: string,
  description: string,
  address: string,
  socialLink: string,
  profileUrl: string,
  adminAddress: string
): BigInt {  // Change return type to BigInt
  let score = BigInt.fromI32(0);  // Initialize as BigInt
  let lowercaseSearchTerm = searchTerm.toLowerCase();
  
  // Highest priority: name matches (score: 100)
  if (name.toLowerCase().includes(lowercaseSearchTerm)) {
    score = score.plus(BigInt.fromI32(100));
  }
  // Second priority: description matches (score: 50)
  if (description.toLowerCase().includes(lowercaseSearchTerm)) {
    score = score.plus(BigInt.fromI32(50));
  }
  // Third priority: other fields matches (score: 25)
  let otherFields = [address, socialLink, profileUrl, adminAddress].join(" ").toLowerCase();
  if (otherFields.includes(lowercaseSearchTerm)) {
    score = score.plus(BigInt.fromI32(25));
  }
  
  return score;
}

export function handleAgentAdded(event: AgentAdded): void {
  let contract = AIAgentIndex.bind(event.address)
  let agentData = contract.getAgent(event.params.id)
  let agent = new Agent(event.params.id.toString())
  
  updateAgentFields(agent, agentData)
  
  // Add search functionality
  agent.searchText = createSearchText(
    agent.name,
    agent.description,
    agent.address,
    agent.socialLink,
    agent.profileUrl,
    agent.adminAddress
  )
  
  // Calculate initial search score (will be updated during searches)
  agent.searchScore = calculateSearchScore(
    "", // Empty search term for initial state
    agent.name,
    agent.description,
    agent.address,
    agent.socialLink,
    agent.profileUrl,
    agent.adminAddress
  )
  
  agent.save()
}

export function handleAgentUpdated(event: AgentUpdated): void {
  let agent = Agent.load(event.params.id.toString())
  if (agent) {
    let contract = AIAgentIndex.bind(event.address)
    let agentData = contract.getAgent(event.params.id)
    updateAgentFields(agent, agentData)
    
    // Update search text
    agent.searchText = createSearchText(
      agent.name,
      agent.description,
      agent.address,
      agent.socialLink,
      agent.profileUrl,
      agent.adminAddress
    )
    
    // Recalculate search score
    agent.searchScore = calculateSearchScore(
      "", // Empty search term for initial state
      agent.name,
      agent.description,
      agent.address,
      agent.socialLink,
      agent.profileUrl,
      agent.adminAddress
    )
    
    agent.save()
  }
}

export function handleAgentDeactivated(event: AgentDeactivated): void {
  let agent = Agent.load(event.params.id.toString())
  if (agent) {
    agent.isActive = false
    agent.save()
  }
}

export function handleAgentReactivated(event: AgentReactivated): void {
  let agent = Agent.load(event.params.id.toString())
  if (agent) {
    agent.isActive = true
    agent.save()
  }
}

function updateAgentFields(agent: Agent, data: ethereum.Tuple): void {
  agent.name = data[0].toString()
  agent.address = data[1].toString()
  agent.socialLink = data[2].toString()
  agent.profileUrl = data[3].toString()
  agent.description = data[4].toString()
  agent.isActive = data[5].toBoolean()
  agent.addedAt = data[6].toBigInt()
  agent.owner = data[7].toAddress()
  agent.lastUpdateTime = data[8].toBigInt()
  agent.adminAddress = data[9].toString()
}