import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  AgentAdded,
  AgentUpdated,
  AgentDeactivated,
  AgentReactivated,
  AdminTransferRequested,
  AdminTransferred,
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

export function handleAgentAdded(event: AgentAdded): void {
  let contract = AIAgentIndex.bind(event.address)
  let agentData = contract.getAgent(event.params.id)
  let agent = new Agent(event.params.id.toString())
  
  updateAgentFields(agent, agentData)
  
  agent.searchText = createSearchText(
    agent.name,
    agent.description,
    agent.address,
    agent.socialLink,
    agent.profileUrl,
    agent.adminAddress
  )
  agent.searchScore = 0
  
  agent.save()
}

export function handleAgentUpdated(event: AgentUpdated): void {
  let agent = Agent.load(event.params.id.toString())
  if (agent) {
    let contract = AIAgentIndex.bind(event.address)
    let agentData = contract.getAgent(event.params.id)
    updateAgentFields(agent, agentData)
    
    agent.searchText = createSearchText(
      agent.name,
      agent.description,
      agent.address,
      agent.socialLink,
      agent.profileUrl,
      agent.adminAddress
    )
    agent.searchScore = 0
    
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

// New handler for admin transfer request
export function handleAdminTransferRequested(event: AdminTransferRequested): void {
  let agent = Agent.load(event.params.agentId.toString())
  if (agent) {
    // Update the timestamp to mark that a transfer is in progress
    agent.lastUpdateTime = event.block.timestamp
    // Could add a pendingAdmin field to schema if needed
    agent.save()
  }
}

// New handler for completed admin transfer
export function handleAdminTransferred(event: AdminTransferred): void {
  let agent = Agent.load(event.params.agentId.toString())
  if (agent) {
    // Update the admin address with the new admin
    agent.adminAddress = event.params.newAdmin.toHexString()
    agent.lastUpdateTime = event.block.timestamp
    
    // Update search text to include new admin address
    agent.searchText = createSearchText(
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