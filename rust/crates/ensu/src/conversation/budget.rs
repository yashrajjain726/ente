use super::{Error, input_budget};

#[derive(Debug, PartialEq, Eq)]
pub struct GenerationBudget {
    pub context: usize,
    pub output: usize,
    pub input: usize,
}

pub fn resolve_generation_budget(
    context: usize,
    output: Option<usize>,
) -> Result<GenerationBudget, Error> {
    if context > i32::MAX as usize || context <= super::SAFETY_TOKENS + 1 {
        return Err(Error::InvalidLimits);
    }
    let output = output.unwrap_or_else(|| 2048.min(context / 4));
    Ok(GenerationBudget {
        context,
        output,
        input: input_budget(context, output)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(serde::Deserialize)]
    struct Case {
        name: String,
        context: usize,
        configured: Option<usize>,
        output: Option<usize>,
        input: Option<usize>,
    }

    #[test]
    fn shared_generation_budget_fixtures() {
        let cases: Vec<Case> = serde_json::from_str(include_str!(
            "../../tests/fixtures/generation-budgets-v1.json"
        ))
        .unwrap();
        for case in cases {
            let result = resolve_generation_budget(case.context, case.configured);
            if let Some(output) = case.output {
                assert_eq!(
                    result.unwrap(),
                    GenerationBudget {
                        context: case.context,
                        output,
                        input: case.input.unwrap()
                    },
                    "{}",
                    case.name
                );
            } else {
                assert!(result.is_err(), "{}", case.name);
            }
        }
    }
}
