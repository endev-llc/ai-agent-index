import { BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts"
import {
  AgentAdded,
  AgentUpdated,
  AgentDeactivated,
  AgentReactivated,
  AIAgentIndex
} from "../generated/AIAgentIndex/AIAgentIndex"
import { Agent } from "../generated/schema"

export function handleAgentAdded(event: AgentAdded): void {
  let contract = AIAgentIndex.bind(event.address)
  let agentData = contract.getAgent(event.params.id)
  let agent = new Agent(event.params.id.toString())
  
  updateAgentFields(agent, agentData)
  agent.save()
}

export function handleAgentUpdated(event: AgentUpdated): void {
  let agent = Agent.load(event.params.id.toString())
  if (agent) {
    let contract = AIAgentIndex.bind(event.address)
    let agentData = contract.getAgent(event.params.id)
    updateAgentFields(agent, agentData)
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
  
  // Set weighted search fields
  agent.nameSearchText = data[0].toString().toLowerCase()
  agent.descriptionSearchText = data[4].toString().toLowerCase()
  agent.otherSearchText = data[1].toString().toLowerCase() + " " + 
                         data[2].toString().toLowerCase() + " " + 
                         data[3].toString().toLowerCase() + " " + 
                         data[9].toString().toLowerCase()
}